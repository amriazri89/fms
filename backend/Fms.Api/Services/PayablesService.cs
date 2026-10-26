using System.Globalization;
using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fms.Api.Services;

/// <summary>
/// Pembekal & hutang kita.
///
/// Peraturan duit (selari dengan Ledger.cs):
///  - Bil pembekal: tiada duit bergerak semasa bil direkod. Setiap bayaran = Duit keluar
///    dengan kategori bil (dikira belanja pada hari dibayar).
///  - Pinjaman: duit pinjaman masuk = LoanIn (bukan pendapatan). Bayar pokok = LoanRepayment
///    (bukan belanja). Faedah / caj = Duit keluar (dikira belanja).
///  - Rekod duit yang dijana dikunci; batal bayaran untuk membetulkan.
/// </summary>
public class PayablesService(
    AppDbContext db,
    CurrentUser user,
    AuditService audit,
    IOptions<DocumentOptions> documentOptions,
    IOptions<AppOptions> appOptions)
{
    private readonly DocumentOptions _doc = documentOptions.Value;

    public DateOnly Today => Clock.Today(appOptions.Value.TimeZone);

    // =====================================================================
    // Hutang
    // =====================================================================

    public async Task<PagedResult<PayableListItem>> ListAsync(PayableQuery f)
    {
        var today = Today;
        var q = db.Payables.AsNoTracking().AsQueryable();
        if (f.SupplierId is int s) q = q.Where(x => x.SupplierId == s);
        if (f.BusinessUnitId is int b) q = q.Where(x => x.BusinessUnitId == b);
        if (f.Kind is PayableKind k) q = q.Where(x => x.Kind == k);
        if (!string.IsNullOrWhiteSpace(f.Q))
        {
            var like = $"%{f.Q.Trim()}%";
            q = q.Where(x => EF.Functions.Like(x.Number, like) || EF.Functions.Like(x.Description, like) ||
                             EF.Functions.Like(x.Supplier!.Name, like) ||
                             (x.SupplierReference != null && EF.Functions.Like(x.SupplierReference, like)));
        }

        var status = f.Status?.ToLowerInvariant();
        q = status switch
        {
            "unpaid" => q.Where(x => x.Status == PayableStatus.Unpaid || x.Status == PayableStatus.PartiallyPaid),
            "overdue" => q.Where(x => (x.Status == PayableStatus.Unpaid || x.Status == PayableStatus.PartiallyPaid) && x.DueDate < today),
            "paid" => q.Where(x => x.Status == PayableStatus.Paid),
            "cancelled" => q.Where(x => x.Status == PayableStatus.Cancelled),
            "active" => q.Where(x => x.Status != PayableStatus.Cancelled),
            _ => q,
        };

        var sums = await q.Where(x => x.Status != PayableStatus.Cancelled).Select(x => new { x.Amount, x.AmountPaid }).ToListAsync();
        var total = await q.CountAsync();
        var page = Math.Max(1, f.Page);
        var size = Math.Clamp(f.PageSize, 1, 200);

        // Hutang belum lunas: paling dekat tarikh akhir dahulu
        var ordered = status is "unpaid" or "overdue"
            ? q.OrderBy(x => x.DueDate).ThenBy(x => x.Id)
            : q.OrderByDescending(x => x.Date).ThenByDescending(x => x.Id);

        var rows = await ordered.Include(x => x.Supplier).Include(x => x.BusinessUnit)
            .Skip((page - 1) * size).Take(size).ToListAsync();

        return new PagedResult<PayableListItem>(rows.Select(x => ToListItem(x, today)).ToList(), total, page, size,
            sums.Sum(x => x.Amount), sums.Sum(x => x.Amount - x.AmountPaid));
    }

    public async Task<PayableDto> GetAsync(int id)
    {
        var today = Today;
        var x = await db.Payables.AsNoTracking()
            .Include(p => p.Supplier).Include(p => p.BusinessUnit).Include(p => p.Category).Include(p => p.CreatedBy)
            .Include(p => p.ReceivedTransaction).ThenInclude(t => t!.Account)
            .Include(p => p.Payments).ThenInclude(pp => pp.Account)
            .Include(p => p.Payments).ThenInclude(pp => pp.CreatedBy)
            .FirstOrDefaultAsync(p => p.Id == id) ?? throw new NotFoundException();

        var payments = x.Payments.OrderBy(p => p.Date).ThenBy(p => p.Id).Select(p => ToDto(p, x)).ToList();

        return new PayableDto(
            x.Id, x.Number, x.Kind, x.Date, x.DueDate,
            x.SupplierId, x.Supplier?.Name ?? "", x.Supplier?.Phone,
            x.BusinessUnitId, x.BusinessUnit?.Name ?? "", x.CategoryId, x.Category?.Name,
            x.Description, x.SupplierReference, x.Amount, x.AmountPaid, Balance(x),
            x.InstallmentAmount, x.Payments.Where(p => !p.IsVoided).Sum(p => p.InterestAmount),
            x.Status, IsOverdue(x, today), DaysToDue(x, today),
            x.Notes, x.CancelReason, x.ReceivedTransactionId, x.ReceivedTransaction?.AccountId, x.ReceivedTransaction?.Account?.Name,
            payments, x.CreatedBy?.FullName ?? "", x.CreatedAt, x.UpdatedAt);
    }

    public async Task<PaymentVoucherDto> GetVoucherAsync(int paymentId)
    {
        var pay = await db.PayablePayments.AsNoTracking()
            .Include(x => x.Account).Include(x => x.CreatedBy)
            .Include(x => x.Payable).ThenInclude(p => p!.Supplier)
            .Include(x => x.Payable).ThenInclude(p => p!.BusinessUnit)
            .FirstOrDefaultAsync(x => x.Id == paymentId) ?? throw new NotFoundException();
        var p = pay.Payable!;

        // Baki selepas bayaran ini (ikut susunan tarikh, bayaran aktif sahaja)
        var paidUpTo = (await db.PayablePayments.AsNoTracking()
                .Where(x => x.PayableId == p.Id && !x.IsVoided)
                .Select(x => new { x.Id, x.Date, x.Amount }).ToListAsync())
            .Where(x => x.Date < pay.Date || (x.Date == pay.Date && x.Id <= pay.Id))
            .Sum(x => x.Amount);

        return new PaymentVoucherDto(ToDto(pay, p), p.Kind, p.Description, p.SupplierReference,
            p.Supplier?.Phone, p.Supplier?.Address, p.Amount, p.Amount - paidUpTo, SalesService.Seller(p.BusinessUnit!));
    }

    public async Task<int> CreateAsync(PayableInput input)
    {
        var supplier = await ValidateAsync(input, null);

        await DocumentNumbers.WriteLock.WaitAsync();
        try
        {
            await using var dbTx = await db.Database.BeginTransactionAsync();

            var p = new Payable { Kind = input.Kind, Status = PayableStatus.Unpaid, CreatedById = user.Id };
            Apply(p, input);
            p.Number = await DocumentNumbers.NextAsync(db, _doc, DocumentType.Payable, p.Date);
            if (input.Kind == PayableKind.Loan && input.ReceivedAccountId is int acc)
                p.ReceivedTransaction = NewLoanInTransaction(p, acc, supplier.Name);

            db.Payables.Add(p);
            await db.SaveChangesAsync();
            audit.Log(AuditActions.Create, "Payable", p.Id, newValue: Snapshot(p));
            await db.SaveChangesAsync();

            await dbTx.CommitAsync();
            return p.Id;
        }
        finally
        {
            DocumentNumbers.WriteLock.Release();
        }
    }

    public async Task UpdateAsync(int id, PayableInput input)
    {
        var p = await db.Payables.Include(x => x.Payments).FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (p.Status == PayableStatus.Cancelled) throw new SalesException("Hutang ini telah dibatalkan.");
        if (p.Payments.Any(x => !x.IsVoided))
            throw new SalesException("Hutang ini sudah ada bayaran. Batalkan bayaran dahulu jika perlu ubah.");
        if (input.Kind != p.Kind) throw Field("kind", "Jenis hutang tidak boleh ditukar.");

        var supplier = await ValidateAsync(input, p.SupplierId);
        var old = Snapshot(p);
        Apply(p, input);
        p.UpdatedAt = DateTime.UtcNow;

        // Pinjaman: selaraskan rekod "Pinjaman diterima"
        if (p.Kind == PayableKind.Loan)
        {
            var existing = p.ReceivedTransactionId is int tid ? await db.Transactions.FirstOrDefaultAsync(t => t.Id == tid) : null;
            if (input.ReceivedAccountId is int acc)
            {
                if (existing is null)
                {
                    p.ReceivedTransaction = NewLoanInTransaction(p, acc, supplier.Name);
                }
                else
                {
                    existing.Date = p.Date;
                    existing.Amount = p.Amount;
                    existing.AccountId = acc;
                    existing.BusinessUnitId = p.BusinessUnitId;
                    existing.Party = supplier.Name;
                    existing.Description = Truncate($"Pinjaman: {p.Description}", 500);
                    existing.UpdatedAt = DateTime.UtcNow;
                }
            }
            else if (existing is not null)
            {
                existing.IsDeleted = true;
                existing.UpdatedAt = DateTime.UtcNow;
                p.ReceivedTransactionId = null;
            }
        }

        audit.Log(AuditActions.Update, "Payable", id, old, Snapshot(p));
        await db.SaveChangesAsync();
    }

    public async Task CancelAsync(int id, string reason)
    {
        var p = await db.Payables.Include(x => x.Payments).FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (p.Status == PayableStatus.Cancelled) throw new SalesException("Hutang ini sudah dibatalkan.");
        if (p.Payments.Any(x => !x.IsVoided)) throw new SalesException("Hutang ini ada bayaran aktif. Batalkan bayaran dahulu.");

        p.Status = PayableStatus.Cancelled;
        p.CancelReason = reason.Trim();
        p.UpdatedAt = DateTime.UtcNow;
        if (p.ReceivedTransactionId is int tid && await db.Transactions.FirstOrDefaultAsync(t => t.Id == tid) is { } t)
        {
            t.IsDeleted = true;
            t.UpdatedAt = DateTime.UtcNow;
        }

        audit.Log(AuditActions.Cancel, "Payable", id, newValue: new { Reason = p.CancelReason });
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Bayaran hutang
    // =====================================================================

    public async Task<int> PayAsync(int payableId, PayablePaymentInput i)
    {
        await DocumentNumbers.WriteLock.WaitAsync();
        try
        {
            await using var dbTx = await db.Database.BeginTransactionAsync();

            var p = await db.Payables.Include(x => x.Payments).Include(x => x.Supplier)
                        .FirstOrDefaultAsync(x => x.Id == payableId) ?? throw new NotFoundException();

            var errors = new Dictionary<string, string[]>();
            var amount = Math.Round(i.Amount, 2);
            var interest = Math.Round(i.InterestAmount, 2);
            var balance = p.Amount - p.Payments.Where(x => !x.IsVoided).Sum(x => x.Amount);

            if (p.Status == PayableStatus.Cancelled) AddError(errors, "payableId", "Hutang ini telah dibatalkan.");
            if (i.Date == default) AddError(errors, "date", "Tarikh diperlukan.");
            if (amount < 0) AddError(errors, "amount", "Jumlah tidak boleh negatif.");
            if (amount > balance) AddError(errors, "amount", $"Melebihi baki hutang (RM{balance.ToString("N2", CultureInfo.InvariantCulture)}).");
            if (interest < 0) AddError(errors, "interestAmount", "Faedah tidak boleh negatif.");
            if (amount <= 0 && interest <= 0) AddError(errors, "amount", "Masukkan jumlah bayaran.");
            if (p.Kind == PayableKind.Bill && interest > 0) AddError(errors, "interestAmount", "Faedah hanya untuk pinjaman.");
            if (!Enum.IsDefined(i.Method)) AddError(errors, "method", "Kaedah bayaran tidak sah.");
            if (!await db.Accounts.AnyAsync(a => a.Id == i.AccountId && a.IsActive))
                AddError(errors, "accountId", "Sila pilih akaun bayar.");
            if (interest > 0)
            {
                var cat = i.InterestCategoryId is int cid ? await db.Categories.FirstOrDefaultAsync(c => c.Id == cid) : null;
                if (cat is null || !cat.IsActive || cat.Type != CategoryType.Expense ||
                    (cat.BusinessUnitId is int cb && cb != p.BusinessUnitId))
                    AddError(errors, "interestCategoryId", "Pilih kategori belanja untuk faedah.");
            }
            if (p.Kind == PayableKind.Bill && amount > 0 && p.CategoryId is null)
                AddError(errors, "amount", "Bil ini tiada kategori belanja. Ubah bil dahulu.");
            ThrowIfAny(errors);

            var supplierName = p.Supplier?.Name ?? "";
            var pay = new PayablePayment
            {
                PayableId = p.Id,
                Date = i.Date,
                Amount = amount,
                InterestAmount = interest,
                InterestCategoryId = interest > 0 ? i.InterestCategoryId : null,
                AccountId = i.AccountId,
                Method = i.Method,
                Reference = Clean(i.Reference),
                Notes = Clean(i.Notes),
                CreatedById = user.Id,
            };
            pay.Number = await DocumentNumbers.NextAsync(db, _doc, DocumentType.PayablePayment, pay.Date);

            if (amount > 0)
            {
                pay.PrincipalTransaction = new Transaction
                {
                    Date = pay.Date,
                    Type = p.Kind == PayableKind.Bill ? TransactionType.Expense : TransactionType.LoanRepayment,
                    Amount = amount,
                    BusinessUnitId = p.BusinessUnitId,
                    AccountId = pay.AccountId,
                    CategoryId = p.Kind == PayableKind.Bill ? p.CategoryId : null,
                    Party = supplierName,
                    Reference = pay.Number,
                    Description = Truncate($"Bayar {p.Number}: {p.Description}", 500),
                    CreatedById = user.Id,
                };
            }
            if (interest > 0)
            {
                pay.InterestTransaction = new Transaction
                {
                    Date = pay.Date,
                    Type = TransactionType.Expense,
                    Amount = interest,
                    BusinessUnitId = p.BusinessUnitId,
                    AccountId = pay.AccountId,
                    CategoryId = pay.InterestCategoryId,
                    Party = supplierName,
                    Reference = pay.Number,
                    Description = Truncate($"Faedah / caj {p.Number}: {p.Description}", 500),
                    CreatedById = user.Id,
                };
            }

            p.Payments.Add(pay);
            Recalculate(p);
            p.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            audit.Log(AuditActions.Create, "PayablePayment", pay.Id,
                newValue: new { pay.Number, Payable = p.Number, pay.Date, pay.Amount, pay.InterestAmount, pay.AccountId, pay.Method });
            await db.SaveChangesAsync();

            await dbTx.CommitAsync();
            return pay.Id;
        }
        finally
        {
            DocumentNumbers.WriteLock.Release();
        }
    }

    public async Task VoidPaymentAsync(int paymentId, string reason)
    {
        var pay = await db.PayablePayments.Include(x => x.Payable).ThenInclude(p => p!.Payments)
                      .FirstOrDefaultAsync(x => x.Id == paymentId) ?? throw new NotFoundException();
        if (pay.IsVoided) throw new SalesException("Bayaran ini sudah dibatalkan.");

        pay.IsVoided = true;
        pay.VoidReason = reason.Trim();
        pay.VoidedAt = DateTime.UtcNow;

        foreach (var tid in new[] { pay.PrincipalTransactionId, pay.InterestTransactionId })
        {
            if (tid is int id && await db.Transactions.FirstOrDefaultAsync(t => t.Id == id) is { } t)
            {
                t.IsDeleted = true;
                t.UpdatedAt = DateTime.UtcNow;
            }
        }

        if (pay.Payable is { } p)
        {
            Recalculate(p);
            p.UpdatedAt = DateTime.UtcNow;
        }

        audit.Log(AuditActions.Void, "PayablePayment", paymentId, newValue: new { pay.Number, Reason = pay.VoidReason });
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Pembekal
    // =====================================================================

    public async Task<IReadOnlyList<SupplierListItem>> ListSuppliersAsync(string? search, bool includeInactive)
    {
        var today = Today;
        var sq = db.Suppliers.AsNoTracking().Where(s => includeInactive || s.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var like = $"%{search.Trim()}%";
            sq = sq.Where(s => EF.Functions.Like(s.Name, like) ||
                               (s.Phone != null && EF.Functions.Like(s.Phone, like)) ||
                               (s.ContactPerson != null && EF.Functions.Like(s.ContactPerson, like)) ||
                               (s.Tag != null && EF.Functions.Like(s.Tag, like)));
        }
        var suppliers = await sq.OrderBy(s => s.Name).ToListAsync();

        var open = (await db.Payables.AsNoTracking()
                .Where(p => p.Status == PayableStatus.Unpaid || p.Status == PayableStatus.PartiallyPaid)
                .Select(p => new { p.SupplierId, p.Amount, p.AmountPaid, p.DueDate })
                .ToListAsync())
            .ToLookup(p => p.SupplierId);

        return suppliers.Select(s =>
        {
            var list = open[s.Id].ToList();
            DateOnly? next = list.Count > 0 ? list.Min(x => x.DueDate) : null;
            return new SupplierListItem(s.Id, s.Name, s.ContactPerson, s.Phone, s.Tag, s.IsActive,
                list.Sum(x => x.Amount - x.AmountPaid), list.Count, list.Count(x => x.DueDate < today), next);
        }).ToList();
    }

    public async Task<SupplierDetailDto> GetSupplierAsync(int id)
    {
        var today = Today;
        var s = await db.Suppliers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();

        var payables = await db.Payables.AsNoTracking().Include(p => p.Supplier).Include(p => p.BusinessUnit)
            .Where(p => p.SupplierId == id).OrderByDescending(p => p.Date).ThenByDescending(p => p.Id).ToListAsync();

        var payments = await db.PayablePayments.AsNoTracking()
            .Include(x => x.Payable).ThenInclude(p => p!.Supplier)
            .Include(x => x.Account).Include(x => x.CreatedBy)
            .Where(x => x.Payable!.SupplierId == id)
            .OrderByDescending(x => x.Date).ThenByDescending(x => x.Id).ToListAsync();

        var active = payables.Where(p => p.Status != PayableStatus.Cancelled).ToList();
        var total = active.Sum(p => p.Amount);
        var paid = active.Sum(p => p.AmountPaid);

        return new SupplierDetailDto(ToDto(s), total, paid, total - paid,
            payables.Select(p => ToListItem(p, today)).ToList(),
            payments.Select(x => ToDto(x, x.Payable!)).ToList());
    }

    public async Task<SupplierDto> SaveSupplierAsync(int? id, SupplierInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) throw Field("name", "Nama pembekal diperlukan.");

        Supplier s;
        object? old = null;
        if (id is int existingId)
        {
            s = await db.Suppliers.FirstOrDefaultAsync(x => x.Id == existingId) ?? throw new NotFoundException();
            old = ToDto(s);
        }
        else
        {
            s = new Supplier();
            db.Suppliers.Add(s);
        }

        s.Name = input.Name.Trim();
        s.ContactPerson = Clean(input.ContactPerson);
        s.Phone = Clean(input.Phone);
        s.Email = Clean(input.Email);
        s.Address = Clean(input.Address);
        s.Tag = Clean(input.Tag);
        s.Notes = Clean(input.Notes);
        s.IsActive = input.IsActive;
        await db.SaveChangesAsync();

        audit.Log(id is null ? AuditActions.Create : AuditActions.Update, "Supplier", s.Id, old, ToDto(s));
        await db.SaveChangesAsync();
        return ToDto(s);
    }

    public async Task DeleteSupplierAsync(int id)
    {
        var s = await db.Suppliers.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        var used = await db.Payables.AnyAsync(p => p.SupplierId == id);
        if (used) s.IsActive = false;
        else db.Suppliers.Remove(s);

        audit.Log(AuditActions.Delete, "Supplier", id, ToDto(s), new { deactivatedOnly = used });
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Helpers
    // =====================================================================

    private async Task<Supplier> ValidateAsync(PayableInput i, int? currentSupplierId)
    {
        var errors = new Dictionary<string, string[]>();
        if (!Enum.IsDefined(i.Kind)) AddError(errors, "kind", "Jenis hutang tidak sah.");
        if (i.Date == default) AddError(errors, "date", "Tarikh diperlukan.");
        if (i.DueDate < i.Date) AddError(errors, "dueDate", "Tarikh akhir bayar mesti sama atau selepas tarikh hutang.");
        if (string.IsNullOrWhiteSpace(i.Description)) AddError(errors, "description", "Nyatakan perkara.");
        if (i.Amount <= 0) AddError(errors, "amount", "Jumlah mesti lebih daripada 0.");
        if (i.InstallmentAmount is < 0) AddError(errors, "installmentAmount", "Ansuran tidak boleh negatif.");

        var supplier = await db.Suppliers.FirstOrDefaultAsync(s => s.Id == i.SupplierId && (s.IsActive || s.Id == currentSupplierId));
        if (supplier is null) AddError(errors, "supplierId", "Sila pilih pembekal / pemiutang.");

        if (!await db.BusinessUnits.AnyAsync(b => b.Id == i.BusinessUnitId && b.IsActive))
            AddError(errors, "businessUnitId", "Sila pilih perniagaan.");

        if (i.Kind == PayableKind.Bill)
        {
            var cat = i.CategoryId is int cid ? await db.Categories.FirstOrDefaultAsync(c => c.Id == cid) : null;
            if (cat is null || !cat.IsActive || cat.Type != CategoryType.Expense ||
                (cat.BusinessUnitId is int cb && cb != i.BusinessUnitId))
                AddError(errors, "categoryId", "Pilih kategori belanja.");
        }
        if (i.Kind == PayableKind.Loan && i.ReceivedAccountId is int acc && !await db.Accounts.AnyAsync(a => a.Id == acc && a.IsActive))
            AddError(errors, "receivedAccountId", "Akaun tidak sah.");

        ThrowIfAny(errors);
        return supplier!;
    }

    private static void Apply(Payable p, PayableInput i)
    {
        p.SupplierId = i.SupplierId;
        p.BusinessUnitId = i.BusinessUnitId;
        p.CategoryId = i.Kind == PayableKind.Bill ? i.CategoryId : null;
        p.Date = i.Date;
        p.DueDate = i.DueDate;
        p.Description = i.Description.Trim();
        p.SupplierReference = Clean(i.SupplierReference);
        p.Amount = Math.Round(i.Amount, 2);
        p.InstallmentAmount = i.Kind == PayableKind.Loan && i.InstallmentAmount is decimal inst && inst > 0 ? Math.Round(inst, 2) : null;
        p.Notes = Clean(i.Notes);
    }

    private Transaction NewLoanInTransaction(Payable p, int accountId, string supplierName) => new()
    {
        Date = p.Date,
        Type = TransactionType.LoanIn,
        Amount = p.Amount,
        BusinessUnitId = p.BusinessUnitId,
        AccountId = accountId,
        Party = supplierName,
        Reference = p.Number,
        Description = Truncate($"Pinjaman: {p.Description}", 500),
        CreatedById = user.Id,
    };

    private static void Recalculate(Payable p)
    {
        p.AmountPaid = p.Payments.Where(x => !x.IsVoided).Sum(x => x.Amount);
        if (p.Status != PayableStatus.Cancelled) p.Status = PayableMath.Status(p.Amount, p.AmountPaid);
    }

    private static decimal Balance(Payable p) => p.Status == PayableStatus.Cancelled ? 0 : p.Amount - p.AmountPaid;

    private static bool IsOverdue(Payable p, DateOnly today) =>
        (p.Status == PayableStatus.Unpaid || p.Status == PayableStatus.PartiallyPaid) && p.DueDate < today;

    private static int DaysToDue(Payable p, DateOnly today) => p.DueDate.DayNumber - today.DayNumber;

    internal static PayableListItem ToListItem(Payable x, DateOnly today) => new(
        x.Id, x.Number, x.Kind, x.Date, x.DueDate, x.SupplierId, x.Supplier?.Name ?? "",
        x.BusinessUnitId, x.BusinessUnit?.Name ?? "", x.Description, x.SupplierReference,
        x.Amount, x.AmountPaid, Balance(x), x.Status, IsOverdue(x, today), DaysToDue(x, today));

    private static PayablePaymentDto ToDto(PayablePayment p, Payable parent) => new(
        p.Id, p.Number, p.PayableId, parent.Number, parent.Supplier?.Name ?? "",
        p.Date, p.Amount, p.InterestAmount, p.Account?.Name ?? "", p.Method,
        p.Reference, p.Notes, p.IsVoided, p.VoidReason, p.CreatedBy?.FullName ?? "", p.CreatedAt);

    private static SupplierDto ToDto(Supplier s) => new(s.Id, s.Name, s.ContactPerson, s.Phone, s.Email, s.Address,
        s.Tag, s.Notes, s.IsActive, s.CreatedAt);

    private static object Snapshot(Payable p) => new
    {
        p.Number, p.Kind, p.SupplierId, p.BusinessUnitId, p.CategoryId, p.Date, p.DueDate, p.Description, p.Amount, p.InstallmentAmount,
    };

    private static void AddError(Dictionary<string, string[]> errors, string field, string message)
    {
        if (!errors.ContainsKey(field)) errors[field] = [message];
    }

    private static void ThrowIfAny(Dictionary<string, string[]> errors)
    {
        if (errors.Count > 0) throw new SalesException(errors.Values.First()[0], errors);
    }

    private static SalesException Field(string field, string message) =>
        new(message, new Dictionary<string, string[]> { [field] = [message] });

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];
}
