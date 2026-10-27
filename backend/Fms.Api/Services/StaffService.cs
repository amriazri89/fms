using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fms.Api.Services;

/// <summary>
/// Pekerja, gaji dan bil utiliti.
/// Setiap bayaran menjana rekod Duit Keluar (Expense) yang dikunci; batal bayaran
/// untuk membetulkan (rekod duit itu dibuang dan untung rugi dikira semula).
/// </summary>
public class StaffService(
    AppDbContext db,
    CurrentUser user,
    AuditService audit,
    IOptions<DocumentOptions> documentOptions,
    IOptions<AppOptions> appOptions)
{
    private readonly DocumentOptions _doc = documentOptions.Value;
    public DateOnly Today => Clock.Today(appOptions.Value.TimeZone);

    // =====================================================================
    // Pekerja
    // =====================================================================

    public async Task<IReadOnlyList<EmployeeDto>> ListEmployeesAsync(bool includeInactive)
    {
        var list = await db.Employees.AsNoTracking().Include(e => e.BusinessUnit)
            .Where(e => includeInactive || e.IsActive).OrderBy(e => e.Name).ToListAsync();
        var year = Today.Year;
        var wages = (await db.Wages.AsNoTracking().Where(w => !w.IsVoided)
                .Select(w => new { w.EmployeeId, w.PeriodMonth, w.PayDate, w.NetPay }).ToListAsync())
            .ToLookup(w => w.EmployeeId);
        return list.Select(e => ToDto(e,
            wages[e.Id].Select(w => w.PeriodMonth).DefaultIfEmpty().Max(),
            wages[e.Id].Where(w => w.PayDate.Year == year).Sum(w => w.NetPay))).ToList();
    }

    public async Task<EmployeeDto> GetEmployeeAsync(int id) =>
        (await ListEmployeesAsync(true)).FirstOrDefault(e => e.Id == id) ?? throw new NotFoundException();

    public async Task<EmployeeDto> SaveEmployeeAsync(int? id, EmployeeInput i)
    {
        var v = new Check()
            .Field(!string.IsNullOrWhiteSpace(i.Name), "name", "Nama pekerja diperlukan.")
            .Field(Enum.IsDefined(i.EmploymentType), "employmentType", "Pilih jenis gaji.")
            .Field(i.BasicRate >= 0, "basicRate", "Kadar tidak boleh negatif.");
        if (i.BusinessUnitId is int bu)
            v.Field(await db.BusinessUnits.AnyAsync(b => b.Id == bu && b.IsActive), "businessUnitId", "Perniagaan tidak sah.");
        v.ThrowIfAny();

        Employee e;
        object? old = null;
        if (id is int existing)
        {
            e = await db.Employees.FirstOrDefaultAsync(x => x.Id == existing) ?? throw new NotFoundException();
            old = new { e.Name, e.Position, e.EmploymentType, e.BasicRate, e.IsActive };
        }
        else
        {
            e = new Employee();
            db.Employees.Add(e);
        }
        e.Name = i.Name.Trim();
        e.IcNo = Clean(i.IcNo);
        e.Phone = Clean(i.Phone);
        e.Position = Clean(i.Position);
        e.BusinessUnitId = i.BusinessUnitId;
        e.EmploymentType = i.EmploymentType;
        e.BasicRate = Math.Round(i.BasicRate, 2);
        e.JoinDate = i.JoinDate;
        e.BankName = Clean(i.BankName);
        e.BankAccountNo = Clean(i.BankAccountNo);
        e.Notes = Clean(i.Notes);
        e.IsActive = i.IsActive;
        await db.SaveChangesAsync();
        audit.Log(id is null ? AuditActions.Create : AuditActions.Update, "Employee", e.Id, old,
            new { e.Name, e.Position, e.EmploymentType, e.BasicRate, e.IsActive });
        await db.SaveChangesAsync();
        return await GetEmployeeAsync(e.Id);
    }

    /// <summary>Pekerja yang ada rekod gaji / tuntutan hanya dinyahaktifkan.</summary>
    public async Task DeleteEmployeeAsync(int id)
    {
        var e = await db.Employees.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        var used = await db.Wages.AnyAsync(w => w.EmployeeId == id) || await db.Claims.AnyAsync(c => c.EmployeeId == id);
        if (used) e.IsActive = false;
        else db.Employees.Remove(e);
        audit.Log(AuditActions.Delete, "Employee", id, new { e.Name }, new { deactivatedOnly = used });
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Gaji
    // =====================================================================

    private IQueryable<Wage> WageQuery() => db.Wages.AsNoTracking()
        .Include(w => w.Employee).Include(w => w.BusinessUnit).Include(w => w.Account).Include(w => w.Category).Include(w => w.CreatedBy);

    public async Task<ListResult<WageDto>> ListWagesAsync(WageQuery f)
    {
        var q = WageQuery();
        if (!f.IncludeVoided) q = q.Where(w => !w.IsVoided);
        if (f.EmployeeId is int e) q = q.Where(w => w.EmployeeId == e);
        if (!string.IsNullOrWhiteSpace(f.Month)) q = q.Where(w => w.PeriodMonth == f.Month);
        if (f.Year is int y)
        {
            var prefix = $"{y:D4}-";
            q = q.Where(w => w.PeriodMonth.StartsWith(prefix));
        }
        var rows = await q.OrderByDescending(w => w.PeriodMonth).ThenBy(w => w.Employee!.Name).ThenByDescending(w => w.Id).ToListAsync();
        return new ListResult<WageDto>(rows.Select(ToDto).ToList(), rows.Count, rows.Where(w => !w.IsVoided).Sum(w => w.NetPay));
    }

    public async Task<WageDto> GetWageAsync(int id) =>
        ToDto(await WageQuery().FirstOrDefaultAsync(w => w.Id == id) ?? throw new NotFoundException());

    public async Task<int> PayWageAsync(WageInput i)
    {
        var net = Math.Round(i.BasicPay + i.Allowance + i.Overtime - i.Deduction, 2);
        var emp = await db.Employees.FirstOrDefaultAsync(e => e.Id == i.EmployeeId && e.IsActive);
        var v = new Check()
            .Field(emp is not null, "employeeId", "Pilih pekerja.")
            .Field(IsMonth(i.PeriodMonth), "periodMonth", "Pilih bulan gaji.")
            .Field(i.PayDate != default, "payDate", "Tarikh bayar diperlukan.")
            .Field(i.BasicPay >= 0 && i.Allowance >= 0 && i.Overtime >= 0 && i.Deduction >= 0, "basicPay", "Jumlah tidak boleh negatif.")
            .Field(i.DaysWorked is null or >= 0, "daysWorked", "Hari bekerja tidak boleh negatif.")
            .Field(net > 0, "deduction", "Gaji bersih mesti lebih daripada 0.")
            .Field(Enum.IsDefined(i.Method), "method", "Pilih kaedah bayaran.");
        await CheckMoneyFieldsAsync(v, i.BusinessUnitId, i.AccountId, i.CategoryId);
        if (emp is not null && IsMonth(i.PeriodMonth) &&
            await db.Wages.AnyAsync(w => w.EmployeeId == i.EmployeeId && w.PeriodMonth == i.PeriodMonth && !w.IsVoided))
            v.Field(false, "periodMonth", $"Gaji {emp.Name} untuk bulan ini sudah direkod. Batalkan rekod lama jika perlu ubah.");
        v.ThrowIfAny();

        await DocumentNumbers.WriteLock.WaitAsync();
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var w = new Wage
            {
                EmployeeId = i.EmployeeId, PeriodMonth = i.PeriodMonth, DaysWorked = i.DaysWorked,
                BasicPay = Math.Round(i.BasicPay, 2), Allowance = Math.Round(i.Allowance, 2), Overtime = Math.Round(i.Overtime, 2),
                Deduction = Math.Round(i.Deduction, 2), NetPay = net, PayDate = i.PayDate, BusinessUnitId = i.BusinessUnitId,
                AccountId = i.AccountId, CategoryId = i.CategoryId, Method = i.Method, Notes = Clean(i.Notes), CreatedById = user.Id,
            };
            w.Number = await DocumentNumbers.NextAsync(db, _doc, DocumentType.Payslip, w.PayDate);
            w.Transaction = Expense(w.PayDate, net, w.BusinessUnitId, w.AccountId, w.Method, w.CategoryId, emp!.Name, w.Number,
                $"Gaji {emp.Name} ({MonthLabel(w.PeriodMonth)})");
            db.Wages.Add(w);
            await db.SaveChangesAsync();
            audit.Log(AuditActions.Create, "Wage", w.Id, newValue: new { w.Number, Employee = emp.Name, w.PeriodMonth, w.NetPay, w.PayDate });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return w.Id;
        }
        finally
        {
            DocumentNumbers.WriteLock.Release();
        }
    }

    public async Task VoidWageAsync(int id, string reason)
    {
        var w = await db.Wages.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (w.IsVoided) throw new SalesException("Rekod gaji ini sudah dibatalkan.");
        w.IsVoided = true;
        w.VoidReason = reason.Trim();
        w.VoidedAt = DateTime.UtcNow;
        await RemoveTransactionAsync(w.TransactionId);
        audit.Log(AuditActions.Void, "Wage", id, newValue: new { w.Number, Reason = w.VoidReason });
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Bil utiliti
    // =====================================================================

    private IQueryable<UtilityBill> UtilityQuery() => db.UtilityBills.AsNoTracking()
        .Include(u => u.BusinessUnit).Include(u => u.Category).Include(u => u.PaidAccount).Include(u => u.CreatedBy);

    public async Task<ListResult<UtilityDto>> ListUtilitiesAsync(UtilityQuery f)
    {
        var today = Today;
        var q = UtilityQuery();
        if (f.Type is UtilityType t) q = q.Where(u => u.Type == t);
        if (f.BusinessUnitId is int b) q = q.Where(u => u.BusinessUnitId == b);
        if (f.From is DateOnly from) q = q.Where(u => u.BillDate >= from);
        if (f.To is DateOnly to) q = q.Where(u => u.BillDate <= to);
        q = f.Status?.ToLowerInvariant() switch
        {
            "unpaid" => q.Where(u => u.Status == UtilityBillStatus.Unpaid),
            "overdue" => q.Where(u => u.Status == UtilityBillStatus.Unpaid && u.DueDate < today),
            "paid" => q.Where(u => u.Status == UtilityBillStatus.Paid),
            _ => q,
        };
        var rows = await (f.Status is "unpaid" or "overdue"
            ? q.OrderBy(u => u.DueDate).ThenBy(u => u.Id)
            : q.OrderByDescending(u => u.BillDate).ThenByDescending(u => u.Id)).ToListAsync();
        return new ListResult<UtilityDto>(rows.Select(u => ToDto(u, today)).ToList(), rows.Count, rows.Sum(u => u.Amount));
    }

    public async Task<UtilityDto> GetUtilityAsync(int id) =>
        ToDto(await UtilityQuery().FirstOrDefaultAsync(u => u.Id == id) ?? throw new NotFoundException(), Today);

    public async Task<int> CreateUtilityAsync(UtilityInput i)
    {
        await ValidateUtilityAsync(i);
        await DocumentNumbers.WriteLock.WaitAsync();
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var u = new UtilityBill { CreatedById = user.Id, Status = UtilityBillStatus.Unpaid };
            ApplyUtility(u, i);
            u.Number = await DocumentNumbers.NextAsync(db, _doc, DocumentType.UtilityBill, u.BillDate);
            if (i.PayNow is { } pay) MarkUtilityPaid(u, pay);
            db.UtilityBills.Add(u);
            await db.SaveChangesAsync();
            audit.Log(AuditActions.Create, "UtilityBill", u.Id, newValue: new { u.Number, u.Type, u.Amount, u.Status });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return u.Id;
        }
        finally
        {
            DocumentNumbers.WriteLock.Release();
        }
    }

    public async Task UpdateUtilityAsync(int id, UtilityInput i)
    {
        var u = await db.UtilityBills.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (u.Status == UtilityBillStatus.Paid)
            throw new SalesException("Bil ini sudah dibayar. Batalkan bayaran dahulu jika perlu ubah.");
        await ValidateUtilityAsync(i with { PayNow = null });
        ApplyUtility(u, i);
        u.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Update, "UtilityBill", id, newValue: new { u.Type, u.Amount, u.BillDate });
        await db.SaveChangesAsync();
    }

    public async Task PayUtilityAsync(int id, UtilityPayInput pay)
    {
        var u = await db.UtilityBills.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (u.Status == UtilityBillStatus.Paid) throw new SalesException("Bil ini sudah dibayar.");
        var v = new Check();
        CheckPay(v, pay.PaidDate, pay.Method);
        v.Field(await db.Accounts.AnyAsync(a => a.Id == pay.AccountId && a.IsActive), "accountId", "Pilih akaun bayar.");
        v.ThrowIfAny();
        MarkUtilityPaid(u, pay);
        u.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Update, "UtilityBill", id, newValue: new { Paid = pay.PaidDate, pay.AccountId });
        await db.SaveChangesAsync();
    }

    /// <summary>Batal bayaran: bil kembali "belum bayar", rekod Duit Keluar dibuang.</summary>
    public async Task UnpayUtilityAsync(int id, string reason)
    {
        var u = await db.UtilityBills.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (u.Status != UtilityBillStatus.Paid) throw new SalesException("Bil ini belum dibayar.");
        await RemoveTransactionAsync(u.TransactionId);
        u.TransactionId = null;
        u.Status = UtilityBillStatus.Unpaid;
        u.PaidDate = null;
        u.PaidAccountId = null;
        u.Method = null;
        u.Reference = null;
        u.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Void, "UtilityBill", id, newValue: new { u.Number, Reason = reason.Trim() });
        await db.SaveChangesAsync();
    }

    public async Task DeleteUtilityAsync(int id)
    {
        var u = await db.UtilityBills.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (u.Status == UtilityBillStatus.Paid) throw new SalesException("Bil yang sudah dibayar tidak boleh dipadam. Batalkan bayaran dahulu.");
        db.UtilityBills.Remove(u);
        audit.Log(AuditActions.Delete, "UtilityBill", id, new { u.Number, u.Amount });
        await db.SaveChangesAsync();
    }

    private async Task ValidateUtilityAsync(UtilityInput i)
    {
        var v = new Check()
            .Field(Enum.IsDefined(i.Type), "type", "Pilih jenis bil.")
            .Field(i.BillDate != default, "billDate", "Tarikh bil diperlukan.")
            .Field(i.DueDate >= i.BillDate, "dueDate", "Tarikh akhir mesti sama atau selepas tarikh bil.")
            .Field(IsMonth(i.PeriodMonth), "periodMonth", "Pilih bulan penggunaan.")
            .Field(i.Amount > 0, "amount", "Jumlah mesti lebih daripada 0.");
        await CheckMoneyFieldsAsync(v, i.BusinessUnitId, i.PayNow?.AccountId, i.CategoryId);
        if (i.PayNow is { } p) CheckPay(v, p.PaidDate, p.Method);
        v.ThrowIfAny();
    }

    private static void ApplyUtility(UtilityBill u, UtilityInput i)
    {
        u.Type = i.Type;
        u.Provider = Clean(i.Provider);
        u.AccountNo = Clean(i.AccountNo);
        u.BusinessUnitId = i.BusinessUnitId;
        u.CategoryId = i.CategoryId;
        u.BillDate = i.BillDate;
        u.DueDate = i.DueDate;
        u.PeriodMonth = i.PeriodMonth;
        u.Amount = Math.Round(i.Amount, 2);
        u.Notes = Clean(i.Notes);
    }

    private void MarkUtilityPaid(UtilityBill u, UtilityPayInput pay)
    {
        u.Status = UtilityBillStatus.Paid;
        u.PaidDate = pay.PaidDate;
        u.PaidAccountId = pay.AccountId;
        u.Method = pay.Method;
        u.Reference = Clean(pay.Reference);
        u.Transaction = Expense(pay.PaidDate, u.Amount, u.BusinessUnitId, pay.AccountId, pay.Method, u.CategoryId, u.Provider, u.Number,
            $"Bil {UtilityLabel(u.Type)} {MonthLabel(u.PeriodMonth)}");
    }

    // =====================================================================
    // Helpers (dikongsi dengan ClaimService)
    // =====================================================================

    internal Transaction Expense(DateOnly date, decimal amount, int businessUnitId, int accountId, PaymentMethod method, int categoryId,
        string? party, string reference, string description) => new()
    {
        Date = date, Type = TransactionType.Expense, Amount = amount, BusinessUnitId = businessUnitId, AccountId = accountId,
        Channel = Ledger.ChannelFor(method), CategoryId = categoryId, Party = party, Reference = reference, Description = Truncate(description, 500), CreatedById = user.Id,
    };

    internal async Task RemoveTransactionAsync(int? transactionId)
    {
        if (transactionId is int tid && await db.Transactions.FirstOrDefaultAsync(t => t.Id == tid) is { } t)
        {
            t.IsDeleted = true;
            t.UpdatedAt = DateTime.UtcNow;
        }
    }

    /// <summary>Semak perniagaan, akaun (jika diberi) dan kategori belanja yang sah untuk perniagaan itu.</summary>
    internal async Task CheckMoneyFieldsAsync(Check v, int businessUnitId, int? accountId, int categoryId)
    {
        v.Field(await db.BusinessUnits.AnyAsync(b => b.Id == businessUnitId && b.IsActive), "businessUnitId", "Pilih perniagaan.");
        if (accountId is int acc)
            v.Field(await db.Accounts.AnyAsync(a => a.Id == acc && a.IsActive), "accountId", "Pilih akaun bayar.");
        var cat = await db.Categories.AsNoTracking().FirstOrDefaultAsync(c => c.Id == categoryId);
        v.Field(cat is not null && cat.IsActive && cat.Type == CategoryType.Expense &&
                (cat.BusinessUnitId is null || cat.BusinessUnitId == businessUnitId), "categoryId", "Pilih kategori belanja.");
    }

    internal void CheckPay(Check v, DateOnly date, PaymentMethod method)
    {
        v.Field(date != default, "paidDate", "Tarikh bayar diperlukan.")
         .Field(date <= Today, "paidDate", "Tarikh bayar tidak boleh pada masa depan.")
         .Field(Enum.IsDefined(method), "method", "Pilih kaedah bayaran.");
    }

    private static readonly string[] MonthNames = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"];
    internal static string MonthLabel(string ym) =>
        IsMonth(ym) ? $"{MonthNames[int.Parse(ym[5..7]) - 1]} {ym[..4]}" : ym;

    internal static string UtilityLabel(UtilityType t) => t switch
    {
        UtilityType.Electricity => "elektrik",
        UtilityType.Water => "air",
        UtilityType.Internet => "internet",
        UtilityType.Phone => "telefon",
        UtilityType.Rent => "sewa",
        UtilityType.Gas => "gas",
        _ => "utiliti",
    };

    internal static bool IsMonth(string? s) => s is { Length: 7 } && DateOnly.TryParseExact(s + "-01", "yyyy-MM-dd", out _);
    internal static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max];

    private EmployeeDto ToDto(Employee e, string? lastPeriod, decimal paidThisYear) => new(
        e.Id, e.Name, e.IcNo, e.Phone, e.Position, e.BusinessUnitId, e.BusinessUnit?.Name, e.EmploymentType, e.BasicRate, e.JoinDate,
        e.BankName, e.BankAccountNo, e.Notes, e.IsActive, lastPeriod, paidThisYear);

    private static WageDto ToDto(Wage w) => new(
        w.Id, w.Number, w.EmployeeId, w.Employee?.Name ?? "", w.Employee?.Position, w.Employee?.IcNo, w.Employee?.BankName,
        w.Employee?.BankAccountNo, w.Employee?.EmploymentType ?? EmploymentType.Monthly, w.PeriodMonth, w.DaysWorked, w.BasicPay,
        w.Allowance, w.Overtime, w.Deduction, w.NetPay, w.PayDate, w.BusinessUnitId, w.BusinessUnit?.Name ?? "", w.Account?.Name ?? "",
        w.Category?.Name ?? "", w.Method, w.Notes, w.IsVoided, w.VoidReason, w.CreatedBy?.FullName ?? "", w.CreatedAt,
        SalesService.Seller(w.BusinessUnit!));

    private static UtilityDto ToDto(UtilityBill u, DateOnly today) => new(
        u.Id, u.Number, u.Type, u.Provider, u.AccountNo, u.BusinessUnitId, u.BusinessUnit?.Name ?? "", u.CategoryId, u.Category?.Name ?? "",
        u.BillDate, u.DueDate, u.PeriodMonth, u.Amount, u.Status, u.Status == UtilityBillStatus.Unpaid && u.DueDate < today,
        u.PaidDate, u.PaidAccountId, u.PaidAccount?.Name, u.Method, u.Reference, u.Notes, u.CreatedBy?.FullName ?? "", u.CreatedAt);
}

/// <summary>Kumpul ralat medan dan buang sekali gus sebagai SalesException (jadi HTTP 400).</summary>
public class Check
{
    private readonly Dictionary<string, string[]> _errors = new();

    public Check Field(bool ok, string field, string message)
    {
        if (!ok && !_errors.ContainsKey(field)) _errors[field] = [message];
        return this;
    }

    public void ThrowIfAny()
    {
        if (_errors.Count > 0) throw new SalesException(_errors.Values.First()[0], _errors);
    }
}
