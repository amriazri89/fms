using System.Globalization;
using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fms.Api.Services;

/// <summary>Ralat perniagaan yang dipaparkan kepada pengguna (400).</summary>
public class SalesException(string message, Dictionary<string, string[]>? errors = null) : Exception(message)
{
    public Dictionary<string, string[]> Errors { get; } = errors ?? new();
}

public class NotFoundException() : Exception("Rekod tidak dijumpai.")
{
}

/// <summary>
/// Semua logik sebut harga, invois dan resit.
///
/// Peraturan utama:
///  - Nombor dokumen dijana di sini sahaja (SH / INV / RS - tahun - turutan).
///  - Setiap resit menjana satu rekod Duit Masuk; batal resit = rekod itu dipadam (soft delete).
///  - Invois yang ada resit aktif tidak boleh diubah atau dibatalkan.
///
/// Nota SQLite: kolum decimal tidak boleh di-SUM/ORDER BY dalam SQL, jadi jumlah dikira dalam memori.
/// </summary>
public class SalesService(
    AppDbContext db,
    CurrentUser user,
    AuditService audit,
    IOptions<DocumentOptions> documentOptions,
    IOptions<AppOptions> appOptions)
{
    // Kunci dikongsi dengan modul lain yang menjana nombor dokumen.
    private static SemaphoreSlim WriteLock => DocumentNumbers.WriteLock;
    private const int MaxLines = 100;

    private readonly DocumentOptions _doc = documentOptions.Value;

    public DateOnly Today => Clock.Today(appOptions.Value.TimeZone);

    public DocumentSettingsDto Settings() => new(_doc.TaxLabel, _doc.DefaultTaxRate, _doc.QuotationValidDays,
        _doc.PaymentTermDays, _doc.DefaultQuotationTerms, _doc.DefaultInvoiceTerms, _doc.ReceiptPrefix,
        _doc.PayablePrefix, _doc.PaymentVoucherPrefix, _doc.PayslipPrefix, _doc.UtilityBillPrefix, _doc.ClaimPrefix, appOptions.Value.CompanyName);

    // =====================================================================
    // Sebut harga
    // =====================================================================

    public async Task<PagedResult<QuotationListItem>> ListQuotationsAsync(SalesQuery f)
    {
        var today = Today;
        var q = db.Quotations.AsNoTracking().AsQueryable();
        if (f.CustomerId is int c) q = q.Where(x => x.CustomerId == c);
        if (f.BusinessUnitId is int b) q = q.Where(x => x.BusinessUnitId == b);
        if (f.From is DateOnly from) q = q.Where(x => x.Date >= from);
        if (f.To is DateOnly to) q = q.Where(x => x.Date <= to);
        if (!string.IsNullOrWhiteSpace(f.Q))
        {
            var s = $"%{f.Q.Trim()}%";
            q = q.Where(x => EF.Functions.Like(x.Number, s) || EF.Functions.Like(x.Customer!.Name, s) ||
                             (x.Subject != null && EF.Functions.Like(x.Subject, s)));
        }
        q = f.Status?.ToLowerInvariant() switch
        {
            "open" => q.Where(x => (x.Status == QuotationStatus.Draft || x.Status == QuotationStatus.Sent) && x.ValidUntil >= today),
            "expired" => q.Where(x => (x.Status == QuotationStatus.Draft || x.Status == QuotationStatus.Sent) && x.ValidUntil < today),
            "accepted" => q.Where(x => x.Status == QuotationStatus.Accepted),
            "rejected" => q.Where(x => x.Status == QuotationStatus.Rejected),
            "converted" => q.Where(x => x.Status == QuotationStatus.Converted),
            _ => q,
        };

        var totals = await q.Select(x => x.Total).ToListAsync();
        var (page, size) = Paging(f);
        var rows = await q.Include(x => x.Customer).Include(x => x.BusinessUnit)
            .OrderByDescending(x => x.Date).ThenByDescending(x => x.Id)
            .Skip((page - 1) * size).Take(size).ToListAsync();

        return new PagedResult<QuotationListItem>(rows.Select(x => ToListItem(x, today)).ToList(), totals.Count, page, size, totals.Sum(), 0);
    }

    public async Task<QuotationDto> GetQuotationAsync(int id)
    {
        var x = await db.Quotations.AsNoTracking()
            .Include(q => q.Items).Include(q => q.Customer).Include(q => q.BusinessUnit).Include(q => q.CreatedBy)
            .FirstOrDefaultAsync(q => q.Id == id) ?? throw new NotFoundException();

        var invoiceNumber = x.InvoiceId is int iid
            ? await db.Invoices.Where(i => i.Id == iid).Select(i => i.Number).FirstOrDefaultAsync()
            : null;

        return new QuotationDto(
            x.Id, x.Number, x.Date, x.ValidUntil, x.Status, IsExpired(x, Today),
            x.BusinessUnitId, x.CustomerId, x.Subject, x.Notes, x.Terms,
            x.Subtotal, x.DiscountAmount, x.TaxRate, x.TaxAmount, x.Total,
            x.InvoiceId, invoiceNumber,
            Lines(x.Items), Seller(x.BusinessUnit!), Buyer(x.Customer!),
            x.CreatedBy?.FullName ?? "", x.CreatedAt, x.UpdatedAt);
    }

    public async Task<int> CreateQuotationAsync(QuotationInput input)
    {
        var errors = await ValidateDocumentAsync(input, null);
        if (input.ValidUntil < input.Date) AddError(errors, "validUntil", "Tarikh sah mesti sama atau selepas tarikh sebut harga.");
        ThrowIfAny(errors);

        await WriteLock.WaitAsync();
        try
        {
            var q = new Quotation { Status = QuotationStatus.Draft, CreatedById = user.Id, ValidUntil = input.ValidUntil };
            ApplyHeader(q, input);
            q.Items = BuildLines<QuotationItem>(input.Items);
            DocumentMath.ApplyTotals(q, q.Items);
            q.Number = await NextNumberAsync(DocumentType.Quotation, q.Date);
            db.Quotations.Add(q);
            await db.SaveChangesAsync();

            audit.Log(AuditActions.Create, "Quotation", q.Id, newValue: Snapshot(q));
            await db.SaveChangesAsync();
            return q.Id;
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public async Task UpdateQuotationAsync(int id, QuotationInput input)
    {
        var q = await db.Quotations.Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (q.Status == QuotationStatus.Converted)
            throw new SalesException("Sebut harga ini sudah ditukar ke invois dan tidak boleh diubah.");

        var errors = await ValidateDocumentAsync(input, q.CustomerId);
        if (input.ValidUntil < input.Date) AddError(errors, "validUntil", "Tarikh sah mesti sama atau selepas tarikh sebut harga.");
        ThrowIfAny(errors);

        var old = Snapshot(q);
        ApplyHeader(q, input);
        q.ValidUntil = input.ValidUntil;
        q.Items.Clear();
        q.Items.AddRange(BuildLines<QuotationItem>(input.Items));
        DocumentMath.ApplyTotals(q, q.Items);
        q.UpdatedAt = DateTime.UtcNow;

        audit.Log(AuditActions.Update, "Quotation", id, old, Snapshot(q));
        await db.SaveChangesAsync();
    }

    public async Task SetQuotationStatusAsync(int id, QuotationStatus status)
    {
        if (status == QuotationStatus.Converted || !Enum.IsDefined(status))
            throw new SalesException("Status tidak sah. Guna 'Tukar ke invois' untuk menukar sebut harga.");

        var q = await db.Quotations.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (q.Status == QuotationStatus.Converted)
            throw new SalesException("Sebut harga ini sudah ditukar ke invois.");

        var old = q.Status;
        q.Status = status;
        q.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Update, "Quotation", id, new { Status = old }, new { Status = status });
        await db.SaveChangesAsync();
    }

    public async Task<int> ConvertToInvoiceAsync(int id)
    {
        await WriteLock.WaitAsync();
        try
        {
            await using var dbTx = await db.Database.BeginTransactionAsync();

            var q = await db.Quotations.Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
            if (q.Status == QuotationStatus.Converted)
                throw new SalesException("Sebut harga ini sudah ditukar ke invois.");

            var today = Today;
            var inv = new Invoice
            {
                BusinessUnitId = q.BusinessUnitId,
                CustomerId = q.CustomerId,
                Date = today,
                DueDate = today.AddDays(_doc.PaymentTermDays),
                Subject = q.Subject,
                Notes = q.Notes,
                Terms = _doc.DefaultInvoiceTerms ?? q.Terms,
                DiscountAmount = q.DiscountAmount,
                TaxRate = q.TaxRate,
                QuotationId = q.Id,
                Status = InvoiceStatus.Unpaid,
                CreatedById = user.Id,
                Items = q.Items.OrderBy(l => l.SortOrder).Select(l => new InvoiceItem
                {
                    SortOrder = l.SortOrder, Description = l.Description, Quantity = l.Quantity,
                    Unit = l.Unit, UnitPrice = l.UnitPrice, Amount = l.Amount,
                }).ToList(),
            };
            DocumentMath.ApplyTotals(inv, inv.Items);
            inv.Number = await NextNumberAsync(DocumentType.Invoice, inv.Date);
            db.Invoices.Add(inv);
            await db.SaveChangesAsync();

            q.Status = QuotationStatus.Converted;
            q.InvoiceId = inv.Id;
            q.UpdatedAt = DateTime.UtcNow;
            audit.Log(AuditActions.Convert, "Quotation", q.Id, newValue: new { Invoice = inv.Number });
            audit.Log(AuditActions.Create, "Invoice", inv.Id, newValue: Snapshot(inv));
            await db.SaveChangesAsync();

            await dbTx.CommitAsync();
            return inv.Id;
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public async Task DeleteQuotationAsync(int id)
    {
        var q = await db.Quotations.Include(x => x.Items).FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (q.Status == QuotationStatus.Converted)
            throw new SalesException("Sebut harga yang sudah ditukar ke invois tidak boleh dipadam.");

        audit.Log(AuditActions.Delete, "Quotation", id, Snapshot(q));
        db.Quotations.Remove(q);
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Invois
    // =====================================================================

    public async Task<PagedResult<InvoiceListItem>> ListInvoicesAsync(SalesQuery f)
    {
        var today = Today;
        var q = db.Invoices.AsNoTracking().AsQueryable();
        if (f.CustomerId is int c) q = q.Where(x => x.CustomerId == c);
        if (f.BusinessUnitId is int b) q = q.Where(x => x.BusinessUnitId == b);
        if (f.From is DateOnly from) q = q.Where(x => x.Date >= from);
        if (f.To is DateOnly to) q = q.Where(x => x.Date <= to);
        if (!string.IsNullOrWhiteSpace(f.Q))
        {
            var s = $"%{f.Q.Trim()}%";
            q = q.Where(x => EF.Functions.Like(x.Number, s) || EF.Functions.Like(x.Customer!.Name, s) ||
                             (x.Subject != null && EF.Functions.Like(x.Subject, s)));
        }
        q = f.Status?.ToLowerInvariant() switch
        {
            "unpaid" => q.Where(x => x.Status == InvoiceStatus.Unpaid || x.Status == InvoiceStatus.PartiallyPaid),
            "overdue" => q.Where(x => (x.Status == InvoiceStatus.Unpaid || x.Status == InvoiceStatus.PartiallyPaid) && x.DueDate < today),
            "paid" => q.Where(x => x.Status == InvoiceStatus.Paid),
            "cancelled" => q.Where(x => x.Status == InvoiceStatus.Cancelled),
            "active" => q.Where(x => x.Status != InvoiceStatus.Cancelled),
            _ => q,
        };

        var sums = await q.Where(x => x.Status != InvoiceStatus.Cancelled).Select(x => new { x.Total, x.AmountPaid }).ToListAsync();
        var total = await q.CountAsync();
        var (page, size) = Paging(f);
        var rows = await q.Include(x => x.Customer).Include(x => x.BusinessUnit)
            .OrderByDescending(x => x.Date).ThenByDescending(x => x.Id)
            .Skip((page - 1) * size).Take(size).ToListAsync();

        return new PagedResult<InvoiceListItem>(rows.Select(x => ToListItem(x, today)).ToList(), total, page, size,
            sums.Sum(s => s.Total), sums.Sum(s => s.Total - s.AmountPaid));
    }

    public async Task<InvoiceDto> GetInvoiceAsync(int id)
    {
        var x = await db.Invoices.AsNoTracking()
            .Include(i => i.Items).Include(i => i.Customer).Include(i => i.BusinessUnit).Include(i => i.CreatedBy)
            .Include(i => i.Payments).ThenInclude(p => p.Account)
            .FirstOrDefaultAsync(i => i.Id == id) ?? throw new NotFoundException();

        var quotationNumber = x.QuotationId is int qid
            ? await db.Quotations.Where(q => q.Id == qid).Select(q => q.Number).FirstOrDefaultAsync()
            : null;

        var payments = x.Payments.OrderBy(p => p.Date).ThenBy(p => p.Id)
            .Select(p => new PaymentListItem(p.Id, p.Number, p.Date, p.Amount, p.Method, p.CustomerId, p.ReceivedFrom,
                x.Id, x.Number, x.BusinessUnit?.Name ?? "", p.Account?.Name ?? "", p.IsVoided))
            .ToList();

        return new InvoiceDto(
            x.Id, x.Number, x.Date, x.DueDate, x.Status, IsOverdue(x, Today),
            x.BusinessUnitId, x.CustomerId, x.Subject, x.Notes, x.Terms,
            x.Subtotal, x.DiscountAmount, x.TaxRate, x.TaxAmount, x.Total,
            x.AmountPaid, Balance(x), x.QuotationId, quotationNumber, x.CancelReason,
            Lines(x.Items), payments, Seller(x.BusinessUnit!), Buyer(x.Customer!),
            x.CreatedBy?.FullName ?? "", x.CreatedAt, x.UpdatedAt);
    }

    public async Task<int> CreateInvoiceAsync(InvoiceInput input)
    {
        var errors = await ValidateDocumentAsync(input, null);
        if (input.DueDate < input.Date) AddError(errors, "dueDate", "Tarikh akhir bayaran mesti sama atau selepas tarikh invois.");
        ThrowIfAny(errors);

        await WriteLock.WaitAsync();
        try
        {
            await using var dbTx = await db.Database.BeginTransactionAsync();

            var inv = new Invoice { Status = InvoiceStatus.Unpaid, CreatedById = user.Id, DueDate = input.DueDate };
            ApplyHeader(inv, input);
            inv.Items = BuildLines<InvoiceItem>(input.Items);
            DocumentMath.ApplyTotals(inv, inv.Items);
            inv.Number = await NextNumberAsync(DocumentType.Invoice, inv.Date);
            db.Invoices.Add(inv);
            await db.SaveChangesAsync();
            audit.Log(AuditActions.Create, "Invoice", inv.Id, newValue: Snapshot(inv));

            // Jualan tunai: terus rekod bayaran penuh
            if (input.PayNow is { } pay && inv.Total > 0)
            {
                var payment = await BuildPaymentAsync(new PaymentInput(
                    inv.Date, inv.BusinessUnitId, inv.CustomerId, null, inv.Id,
                    pay.AccountId, pay.CategoryId, pay.Method, inv.Total, pay.Reference, null), inv);
                await db.SaveChangesAsync();
                audit.Log(AuditActions.Create, "Payment", payment.Id, newValue: PaymentSnapshot(payment));
            }

            await db.SaveChangesAsync();
            await dbTx.CommitAsync();
            return inv.Id;
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public async Task UpdateInvoiceAsync(int id, InvoiceInput input)
    {
        var inv = await db.Invoices.Include(x => x.Items).Include(x => x.Payments).FirstOrDefaultAsync(x => x.Id == id)
                  ?? throw new NotFoundException();
        if (inv.Status == InvoiceStatus.Cancelled)
            throw new SalesException("Invois ini telah dibatalkan.");
        if (inv.Payments.Any(p => !p.IsVoided))
            throw new SalesException("Invois ini sudah ada bayaran. Batalkan resit dahulu jika perlu ubah invois.");

        var errors = await ValidateDocumentAsync(input, inv.CustomerId);
        if (input.DueDate < input.Date) AddError(errors, "dueDate", "Tarikh akhir bayaran mesti sama atau selepas tarikh invois.");
        ThrowIfAny(errors);

        var old = Snapshot(inv);
        ApplyHeader(inv, input);
        inv.DueDate = input.DueDate;
        inv.Items.Clear();
        inv.Items.AddRange(BuildLines<InvoiceItem>(input.Items));
        DocumentMath.ApplyTotals(inv, inv.Items);
        RecalculateInvoice(inv);
        inv.UpdatedAt = DateTime.UtcNow;

        audit.Log(AuditActions.Update, "Invoice", id, old, Snapshot(inv));
        await db.SaveChangesAsync();
    }

    public async Task CancelInvoiceAsync(int id, string reason)
    {
        var inv = await db.Invoices.Include(x => x.Payments).FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (inv.Status == InvoiceStatus.Cancelled) throw new SalesException("Invois ini sudah dibatalkan.");
        if (inv.Payments.Any(p => !p.IsVoided))
            throw new SalesException("Invois ini ada resit aktif. Batalkan resit dahulu.");

        inv.Status = InvoiceStatus.Cancelled;
        inv.CancelReason = reason.Trim();
        inv.UpdatedAt = DateTime.UtcNow;

        // Sebut harga asal boleh ditukar semula ke invois baru
        if (inv.QuotationId is int qid && await db.Quotations.FirstOrDefaultAsync(q => q.Id == qid) is { } quotation)
        {
            quotation.Status = QuotationStatus.Accepted;
            quotation.InvoiceId = null;
            quotation.UpdatedAt = DateTime.UtcNow;
        }

        audit.Log(AuditActions.Cancel, "Invoice", id, newValue: new { Reason = inv.CancelReason });
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Resit
    // =====================================================================

    public async Task<PagedResult<PaymentListItem>> ListReceiptsAsync(SalesQuery f)
    {
        var q = db.Payments.AsNoTracking().AsQueryable();
        if (f.CustomerId is int c) q = q.Where(x => x.CustomerId == c);
        if (f.BusinessUnitId is int b) q = q.Where(x => x.BusinessUnitId == b);
        if (f.From is DateOnly from) q = q.Where(x => x.Date >= from);
        if (f.To is DateOnly to) q = q.Where(x => x.Date <= to);
        if (!string.IsNullOrWhiteSpace(f.Q))
        {
            var s = $"%{f.Q.Trim()}%";
            q = q.Where(x => EF.Functions.Like(x.Number, s) || EF.Functions.Like(x.ReceivedFrom, s) ||
                             (x.Reference != null && EF.Functions.Like(x.Reference, s)));
        }
        q = f.Status?.ToLowerInvariant() switch
        {
            "active" => q.Where(x => !x.IsVoided),
            "voided" => q.Where(x => x.IsVoided),
            _ => q,
        };

        var amounts = await q.Where(x => !x.IsVoided).Select(x => x.Amount).ToListAsync();
        var total = await q.CountAsync();
        var (page, size) = Paging(f);
        var rows = await q.Include(x => x.Invoice).Include(x => x.BusinessUnit).Include(x => x.Account)
            .OrderByDescending(x => x.Date).ThenByDescending(x => x.Id)
            .Skip((page - 1) * size).Take(size).ToListAsync();

        return new PagedResult<PaymentListItem>(rows.Select(p => ToListItem(p)).ToList(), total, page, size, amounts.Sum(), 0);
    }

    public async Task<ReceiptDto> GetReceiptAsync(int id)
    {
        var p = await db.Payments.AsNoTracking()
            .Include(x => x.Invoice).ThenInclude(i => i!.Items)
            .Include(x => x.Customer).Include(x => x.BusinessUnit).Include(x => x.Account)
            .Include(x => x.Category).Include(x => x.CreatedBy)
            .FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();

        decimal? balanceAfter = null;
        if (p.Invoice is { } inv && !p.IsVoided)
        {
            var paid = await db.Payments.AsNoTracking()
                .Where(x => x.InvoiceId == inv.Id && !x.IsVoided)
                .Select(x => new { x.Id, x.Date, x.Amount })
                .ToListAsync();
            var paidUpToThis = paid
                .Where(x => x.Date < p.Date || (x.Date == p.Date && x.Id <= p.Id))
                .Sum(x => x.Amount);
            balanceAfter = inv.Total - paidUpToThis;
        }

        var buyer = p.Customer is { } c
            ? Buyer(c) with { Name = p.ReceivedFrom }
            : new BuyerDto(null, p.ReceivedFrom, null, null, null, null, null);

        return new ReceiptDto(
            p.Id, p.Number, p.Date, p.Amount, p.Method,
            p.BusinessUnitId, p.CustomerId, p.ReceivedFrom,
            p.InvoiceId, p.Invoice?.Number, p.Invoice?.Total, balanceAfter,
            p.AccountId, p.Account?.Name ?? "", p.CategoryId, p.Category?.Name ?? "",
            p.Reference, p.Description,
            p.IsVoided, p.VoidReason, p.VoidedAt, p.TransactionId,
            p.Invoice is null ? new List<DocumentLineDto>() : Lines(p.Invoice.Items),
            Seller(p.BusinessUnit!), buyer,
            p.CreatedBy?.FullName ?? "", p.CreatedAt);
    }

    public async Task<int> CreatePaymentAsync(PaymentInput input)
    {
        await WriteLock.WaitAsync();
        try
        {
            await using var dbTx = await db.Database.BeginTransactionAsync();

            Invoice? inv = null;
            if (input.InvoiceId is int iid)
            {
                inv = await db.Invoices.Include(x => x.Payments).FirstOrDefaultAsync(x => x.Id == iid);
                if (inv is null) throw Field("invoiceId", "Invois tidak dijumpai.");
            }

            var payment = await BuildPaymentAsync(input, inv);
            await db.SaveChangesAsync();
            audit.Log(AuditActions.Create, "Payment", payment.Id, newValue: PaymentSnapshot(payment));
            await db.SaveChangesAsync();

            await dbTx.CommitAsync();
            return payment.Id;
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public async Task VoidPaymentAsync(int id, string reason)
    {
        var p = await db.Payments
            .Include(x => x.Invoice).ThenInclude(i => i!.Payments)
            .FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (p.IsVoided) throw new SalesException("Resit ini sudah dibatalkan.");

        p.IsVoided = true;
        p.VoidReason = reason.Trim();
        p.VoidedAt = DateTime.UtcNow;

        if (p.TransactionId is int tid && await db.Transactions.FirstOrDefaultAsync(t => t.Id == tid) is { } t)
        {
            t.IsDeleted = true;
            t.UpdatedAt = DateTime.UtcNow;
        }

        if (p.Invoice is { } inv)
        {
            RecalculateInvoice(inv);
            inv.UpdatedAt = DateTime.UtcNow;
        }

        audit.Log(AuditActions.Void, "Payment", id, newValue: new { p.Number, Reason = p.VoidReason });
        await db.SaveChangesAsync();
    }

    /// <summary>Sahkan dan sediakan resit + rekod Duit Masuk. Panggil SaveChanges selepas ini.</summary>
    private async Task<Payment> BuildPaymentAsync(PaymentInput i, Invoice? inv)
    {
        var errors = new Dictionary<string, string[]>();
        var amount = Math.Round(i.Amount, 2);
        if (amount <= 0) AddError(errors, "amount", "Jumlah mesti lebih daripada 0.");
        if (i.Date == default) AddError(errors, "date", "Tarikh diperlukan.");
        if (!Enum.IsDefined(i.Method)) AddError(errors, "method", "Kaedah bayaran tidak sah.");

        var businessUnitId = i.BusinessUnitId;
        var customerId = i.CustomerId;
        if (inv is not null)
        {
            if (inv.Status == InvoiceStatus.Cancelled) AddError(errors, "invoiceId", "Invois ini telah dibatalkan.");
            var balance = inv.Total - inv.Payments.Where(x => !x.IsVoided).Sum(x => x.Amount);
            if (amount > balance)
                AddError(errors, "amount", $"Melebihi baki invois (RM{balance.ToString("N2", CultureInfo.InvariantCulture)}).");
            businessUnitId = inv.BusinessUnitId;
            customerId = inv.CustomerId;
        }
        else if (!await db.BusinessUnits.AnyAsync(b => b.Id == businessUnitId && b.IsActive))
        {
            AddError(errors, "businessUnitId", "Sila pilih perniagaan.");
        }

        Customer? customer = null;
        if (customerId is int cid)
        {
            customer = await db.Customers.FirstOrDefaultAsync(c => c.Id == cid);
            if (customer is null) AddError(errors, "customerId", "Pelanggan tidak dijumpai.");
        }

        var receivedFrom = Clean(i.ReceivedFrom) ?? customer?.Name;
        if (receivedFrom is null) AddError(errors, "receivedFrom", "Nyatakan bayaran diterima daripada siapa.");

        if (!await db.Accounts.AnyAsync(a => a.Id == i.AccountId && a.IsActive))
            AddError(errors, "accountId", "Sila pilih akaun duit masuk.");

        var category = await db.Categories.FirstOrDefaultAsync(c => c.Id == i.CategoryId);
        if (category is null || !category.IsActive || category.Type != CategoryType.Income ||
            (category.BusinessUnitId is int cb && cb != businessUnitId))
            AddError(errors, "categoryId", "Sila pilih kategori pendapatan.");

        ThrowIfAny(errors);

        var p = new Payment
        {
            Date = i.Date,
            Amount = amount,
            Method = i.Method,
            BusinessUnitId = businessUnitId,
            CustomerId = customerId,
            ReceivedFrom = receivedFrom!,
            InvoiceId = inv?.Id,
            AccountId = i.AccountId,
            CategoryId = i.CategoryId,
            Reference = Clean(i.Reference),
            Description = Clean(i.Description),
            CreatedById = user.Id,
        };
        p.Number = await NextNumberAsync(DocumentType.Receipt, p.Date);
        p.Transaction = new Transaction
        {
            Date = p.Date,
            Type = TransactionType.Income,
            Amount = p.Amount,
            BusinessUnitId = businessUnitId,
            AccountId = p.AccountId,
            CategoryId = p.CategoryId,
            Party = p.ReceivedFrom,
            Reference = p.Number,
            Description = inv is not null ? $"Bayaran {inv.Number}" : p.Description,
            CreatedById = user.Id,
        };
        db.Payments.Add(p);

        if (inv is not null)
        {
            inv.Payments.Add(p);
            RecalculateInvoice(inv);
            inv.UpdatedAt = DateTime.UtcNow;
        }
        return p;
    }

    private static void RecalculateInvoice(Invoice inv)
    {
        inv.AmountPaid = inv.Payments.Where(p => !p.IsVoided).Sum(p => p.Amount);
        if (inv.Status != InvoiceStatus.Cancelled)
            inv.Status = DocumentMath.PaymentStatus(inv.Total, inv.AmountPaid);
    }

    // =====================================================================
    // Pelanggan (CRM)
    // =====================================================================

    public async Task<IReadOnlyList<CustomerListItem>> ListCustomersAsync(string? search, bool includeInactive)
    {
        var today = Today;
        var cq = db.Customers.AsNoTracking().Where(c => includeInactive || c.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = $"%{search.Trim()}%";
            cq = cq.Where(c => EF.Functions.Like(c.Name, s) ||
                               (c.Phone != null && EF.Functions.Like(c.Phone, s)) ||
                               (c.ContactPerson != null && EF.Functions.Like(c.ContactPerson, s)) ||
                               (c.Tag != null && EF.Functions.Like(c.Tag, s)));
        }
        var customers = await cq.OrderBy(c => c.Name).ToListAsync();

        var invoices = (await db.Invoices.AsNoTracking()
                .Where(i => i.Status != InvoiceStatus.Cancelled)
                .Select(i => new { i.CustomerId, i.Total, i.AmountPaid, i.DueDate, i.Status })
                .ToListAsync())
            .ToLookup(i => i.CustomerId);

        var openQuotations = (await db.Quotations.AsNoTracking()
                .Where(x => (x.Status == QuotationStatus.Draft || x.Status == QuotationStatus.Sent) && x.ValidUntil >= today)
                .Select(x => x.CustomerId)
                .ToListAsync())
            .GroupBy(x => x).ToDictionary(g => g.Key, g => g.Count());

        var lastActivity = (await db.CustomerActivities.AsNoTracking()
                .Select(a => new { a.CustomerId, a.Date })
                .ToListAsync())
            .GroupBy(a => a.CustomerId).ToDictionary(g => g.Key, g => g.Max(a => a.Date));

        return customers.Select(c =>
        {
            var list = invoices[c.Id].ToList();
            var invoiced = list.Sum(i => i.Total);
            var paid = list.Sum(i => i.AmountPaid);
            var overdue = list.Count(i => i.Status != InvoiceStatus.Paid && i.DueDate < today);
            return new CustomerListItem(c.Id, c.Name, c.ContactPerson, c.Phone, c.Tag, c.IsActive,
                invoiced, paid, invoiced - paid, overdue, openQuotations.GetValueOrDefault(c.Id),
                lastActivity.TryGetValue(c.Id, out var d) ? d : null);
        }).ToList();
    }

    public async Task<CustomerDetailDto> GetCustomerAsync(int id)
    {
        var today = Today;
        var c = await db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();

        var activities = await db.CustomerActivities.AsNoTracking().Include(a => a.CreatedBy)
            .Where(a => a.CustomerId == id)
            .OrderByDescending(a => a.Date).ThenByDescending(a => a.Id)
            .ToListAsync();

        var quotations = await db.Quotations.AsNoTracking().Include(x => x.Customer).Include(x => x.BusinessUnit)
            .Where(x => x.CustomerId == id).OrderByDescending(x => x.Date).ThenByDescending(x => x.Id).ToListAsync();

        var invoices = await db.Invoices.AsNoTracking().Include(x => x.Customer).Include(x => x.BusinessUnit)
            .Where(x => x.CustomerId == id).OrderByDescending(x => x.Date).ThenByDescending(x => x.Id).ToListAsync();

        var payments = await db.Payments.AsNoTracking().Include(x => x.Invoice).Include(x => x.BusinessUnit).Include(x => x.Account)
            .Where(x => x.CustomerId == id).OrderByDescending(x => x.Date).ThenByDescending(x => x.Id).ToListAsync();

        var active = invoices.Where(i => i.Status != InvoiceStatus.Cancelled).ToList();
        var invoiced = active.Sum(i => i.Total);
        var paid = active.Sum(i => i.AmountPaid);

        return new CustomerDetailDto(
            ToDto(c), invoiced, paid, invoiced - paid,
            activities.Select(a => ToDto(a, c.Name)).ToList(),
            quotations.Select(x => ToListItem(x, today)).ToList(),
            invoices.Select(x => ToListItem(x, today)).ToList(),
            payments.Select(p => ToListItem(p)).ToList());
    }

    public async Task<CustomerDto> SaveCustomerAsync(int? id, CustomerInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name)) throw Field("name", "Nama pelanggan diperlukan.");

        Customer c;
        object? old = null;
        if (id is int existingId)
        {
            c = await db.Customers.FirstOrDefaultAsync(x => x.Id == existingId) ?? throw new NotFoundException();
            old = ToDto(c);
        }
        else
        {
            c = new Customer();
            db.Customers.Add(c);
        }

        c.Name = input.Name.Trim();
        c.ContactPerson = Clean(input.ContactPerson);
        c.Phone = Clean(input.Phone);
        c.Email = Clean(input.Email);
        c.Address = Clean(input.Address);
        c.RegistrationNo = Clean(input.RegistrationNo);
        c.Tag = Clean(input.Tag);
        c.Notes = Clean(input.Notes);
        c.IsActive = input.IsActive;
        await db.SaveChangesAsync();

        audit.Log(id is null ? AuditActions.Create : AuditActions.Update, "Customer", c.Id, old, ToDto(c));
        await db.SaveChangesAsync();
        return ToDto(c);
    }

    public async Task DeleteCustomerAsync(int id)
    {
        var c = await db.Customers.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        var used = await db.Quotations.AnyAsync(x => x.CustomerId == id)
                   || await db.Invoices.AnyAsync(x => x.CustomerId == id)
                   || await db.Payments.AnyAsync(x => x.CustomerId == id);
        if (used) c.IsActive = false;
        else db.Customers.Remove(c);

        audit.Log(AuditActions.Delete, "Customer", id, ToDto(c), new { deactivatedOnly = used });
        await db.SaveChangesAsync();
    }

    public async Task<CustomerActivityDto> AddActivityAsync(int customerId, CustomerActivityInput input)
    {
        var c = await db.Customers.FirstOrDefaultAsync(x => x.Id == customerId) ?? throw new NotFoundException();
        if (string.IsNullOrWhiteSpace(input.Note)) throw Field("note", "Tulis catatan.");
        if (!Enum.IsDefined(input.Type)) throw Field("type", "Jenis aktiviti tidak sah.");

        var a = new CustomerActivity
        {
            CustomerId = customerId,
            Date = input.Date == default ? Today : input.Date,
            Type = input.Type,
            Note = input.Note.Trim(),
            FollowUpDate = input.FollowUpDate,
            CreatedById = user.Id,
        };
        db.CustomerActivities.Add(a);
        await db.SaveChangesAsync();

        a.CreatedBy = await db.Users.FirstOrDefaultAsync(u => u.Id == user.Id);
        return ToDto(a, c.Name);
    }

    public async Task SetFollowUpDoneAsync(int activityId, bool done)
    {
        var a = await db.CustomerActivities.FirstOrDefaultAsync(x => x.Id == activityId) ?? throw new NotFoundException();
        a.FollowUpDone = done;
        await db.SaveChangesAsync();
    }

    public async Task DeleteActivityAsync(int activityId)
    {
        var a = await db.CustomerActivities.FirstOrDefaultAsync(x => x.Id == activityId) ?? throw new NotFoundException();
        if (!user.IsManager && a.CreatedById != user.Id)
            throw new SalesException("Anda hanya boleh padam catatan sendiri.");
        db.CustomerActivities.Remove(a);
        await db.SaveChangesAsync();
    }

    public async Task<IReadOnlyList<CustomerActivityDto>> FollowUpsAsync()
    {
        var rows = await db.CustomerActivities.AsNoTracking().Include(a => a.Customer).Include(a => a.CreatedBy)
            .Where(a => a.FollowUpDate != null && !a.FollowUpDone && a.Customer!.IsActive)
            .OrderBy(a => a.FollowUpDate)
            .Take(100)
            .ToListAsync();
        return rows.Select(a => ToDto(a, a.Customer?.Name ?? "")).ToList();
    }

    // =====================================================================
    // Helpers
    // =====================================================================

    private Task<string> NextNumberAsync(DocumentType type, DateOnly date) => DocumentNumbers.NextAsync(db, _doc, type, date);

    private async Task<Dictionary<string, string[]>> ValidateDocumentAsync(IDocumentInput i, int? currentCustomerId)
    {
        var errors = new Dictionary<string, string[]>();

        if (i.Date == default) AddError(errors, "date", "Tarikh diperlukan.");
        if (!await db.BusinessUnits.AnyAsync(b => b.Id == i.BusinessUnitId && b.IsActive))
            AddError(errors, "businessUnitId", "Sila pilih perniagaan.");
        if (!await db.Customers.AnyAsync(c => c.Id == i.CustomerId && (c.IsActive || c.Id == currentCustomerId)))
            AddError(errors, "customerId", "Sila pilih pelanggan.");

        var items = i.Items ?? new List<DocumentLineInput>();
        if (items.Count == 0) AddError(errors, "items", "Tambah sekurang-kurangnya satu item.");
        if (items.Count > MaxLines) AddError(errors, "items", $"Maksimum {MaxLines} item.");
        for (var n = 0; n < items.Count; n++)
        {
            var line = items[n];
            if (string.IsNullOrWhiteSpace(line.Description)) AddError(errors, $"items[{n}].description", $"Item {n + 1}: perkara diperlukan.");
            if (line.Quantity <= 0) AddError(errors, $"items[{n}].quantity", $"Item {n + 1}: kuantiti mesti lebih daripada 0.");
            if (line.UnitPrice < 0) AddError(errors, $"items[{n}].unitPrice", $"Item {n + 1}: harga tidak boleh negatif.");
        }

        if (i.DiscountAmount < 0) AddError(errors, "discountAmount", "Diskaun tidak boleh negatif.");
        if (i.TaxRate < 0 || i.TaxRate > 100) AddError(errors, "taxRate", "Kadar cukai mesti antara 0 dan 100.");
        return errors;
    }

    private static void ApplyHeader(SalesDocument d, IDocumentInput i)
    {
        d.BusinessUnitId = i.BusinessUnitId;
        d.CustomerId = i.CustomerId;
        d.Date = i.Date;
        d.Subject = Clean(i.Subject);
        d.Notes = Clean(i.Notes);
        d.Terms = Clean(i.Terms);
        d.DiscountAmount = Math.Round(i.DiscountAmount, 2);
        d.TaxRate = Math.Round(i.TaxRate, 2);
    }

    private static List<T> BuildLines<T>(IEnumerable<DocumentLineInput> items) where T : DocumentLine, new() =>
        items.Select((l, idx) =>
        {
            var qty = Math.Round(l.Quantity, 3);
            var price = Math.Round(l.UnitPrice, 2);
            return new T
            {
                SortOrder = idx + 1,
                Description = l.Description.Trim(),
                Quantity = qty,
                Unit = Clean(l.Unit),
                UnitPrice = price,
                Amount = DocumentMath.LineAmount(qty, price),
            };
        }).ToList();

    private static List<DocumentLineDto> Lines(IEnumerable<DocumentLine> lines) =>
        lines.OrderBy(l => l.SortOrder)
            .Select(l => new DocumentLineDto(l.Id, l.SortOrder, l.Description, l.Quantity, l.Unit, l.UnitPrice, l.Amount))
            .ToList();

    internal static SellerDto Seller(BusinessUnit b) => new(b.Id, b.LegalName ?? b.Name, b.RegistrationNo, b.Address, b.Phone,
        b.Email, b.PaymentInfo, b.DocumentFooter, b.Color);

    private static BuyerDto Buyer(Customer c) => new(c.Id, c.Name, c.ContactPerson, c.Phone, c.Email, c.Address, c.RegistrationNo);

    private static bool IsExpired(Quotation x, DateOnly today) =>
        (x.Status == QuotationStatus.Draft || x.Status == QuotationStatus.Sent) && x.ValidUntil < today;

    private static bool IsOverdue(Invoice x, DateOnly today) =>
        (x.Status == InvoiceStatus.Unpaid || x.Status == InvoiceStatus.PartiallyPaid) && x.DueDate < today;

    private static decimal Balance(Invoice x) => x.Status == InvoiceStatus.Cancelled ? 0 : x.Total - x.AmountPaid;

    private static QuotationListItem ToListItem(Quotation x, DateOnly today) => new(
        x.Id, x.Number, x.Date, x.ValidUntil, x.CustomerId, x.Customer?.Name ?? "", x.BusinessUnitId,
        x.BusinessUnit?.Name ?? "", x.Subject, x.Total, x.Status, IsExpired(x, today), x.InvoiceId);

    private static InvoiceListItem ToListItem(Invoice x, DateOnly today) => new(
        x.Id, x.Number, x.Date, x.DueDate, x.CustomerId, x.Customer?.Name ?? "", x.BusinessUnitId,
        x.BusinessUnit?.Name ?? "", x.Subject, x.Total, x.AmountPaid, Balance(x), x.Status, IsOverdue(x, today), x.QuotationId);

    private static PaymentListItem ToListItem(Payment p) => new(
        p.Id, p.Number, p.Date, p.Amount, p.Method, p.CustomerId, p.ReceivedFrom, p.InvoiceId, p.Invoice?.Number,
        p.BusinessUnit?.Name ?? "", p.Account?.Name ?? "", p.IsVoided);

    private static CustomerDto ToDto(Customer c) => new(c.Id, c.Name, c.ContactPerson, c.Phone, c.Email, c.Address,
        c.RegistrationNo, c.Tag, c.Notes, c.IsActive, c.CreatedAt);

    private static CustomerActivityDto ToDto(CustomerActivity a, string customerName) => new(a.Id, a.CustomerId, customerName,
        a.Date, a.Type, a.Note, a.FollowUpDate, a.FollowUpDone, a.CreatedBy?.FullName ?? "", a.CreatedAt);

    private static object Snapshot(SalesDocument d) => new
    {
        d.Number, d.BusinessUnitId, d.CustomerId, d.Date, d.Subject, d.Subtotal, d.DiscountAmount, d.TaxRate, d.TaxAmount, d.Total,
    };

    private static object PaymentSnapshot(Payment p) => new
    {
        p.Number, p.Date, p.Amount, p.Method, p.BusinessUnitId, p.CustomerId, p.ReceivedFrom, p.InvoiceId, p.AccountId, p.CategoryId,
    };

    private static (int Page, int Size) Paging(SalesQuery f) => (Math.Max(1, f.Page), Math.Clamp(f.PageSize, 1, 200));

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
}
