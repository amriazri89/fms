using System.Globalization;
using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fms.Api.Services;

/// <summary>Baki buku hutang seorang pelanggan dalam satu perniagaan.</summary>
public record CreditBalance(
    int CustomerId, int BusinessUnitId, decimal TotalTaken, decimal TotalPaid,
    DateOnly? LastTakenDate, DateOnly? LastPaidDate, DateOnly? OldestUnpaidDate)
{
    public decimal Balance => TotalTaken - TotalPaid;
}

/// <summary>
/// Buku hutang kedai (555).
///
/// Peraturan:
///  - Rekod hutang (ambil barang) tidak dikira jualan.
///  - Bayaran = resit biasa (RS-YYYY-NNNN) yang ditanda IsCreditPayment dan menjana Duit Masuk.
///    Jualan dikira pada tarikh bayar, sama seperti invois.
///  - Bayaran tidak boleh melebihi baki. Rekod hutang tidak boleh dibatalkan jika
///    baki akan jadi negatif (batalkan resit bayaran dahulu).
///  - Batal bayaran guna skrin Resit sedia ada (/resit/:id).
/// </summary>
public class CreditBookService(
    AppDbContext db,
    CurrentUser user,
    AuditService audit,
    SalesService sales,
    IOptions<AppOptions> appOptions)
{
    private static SemaphoreSlim WriteLock => DocumentNumbers.WriteLock;
    private const string PaymentDescription = "Bayaran buku hutang";

    public DateOnly Today => Clock.Today(appOptions.Value.TimeZone);

    // =====================================================================
    // Baki — satu-satunya tempat baki buku hutang dikira
    // (digunakan juga oleh Ringkasan dan senarai Pelanggan)
    // =====================================================================

    public static async Task<List<CreditBalance>> BalancesAsync(AppDbContext db, int? businessUnitId = null, int? customerId = null)
    {
        var entries = await db.CreditSales.AsNoTracking()
            .Where(x => !x.IsVoided)
            .Where(x => businessUnitId == null || x.BusinessUnitId == businessUnitId)
            .Where(x => customerId == null || x.CustomerId == customerId)
            .Select(x => new { x.Id, x.CustomerId, x.BusinessUnitId, x.Date, x.Amount })
            .ToListAsync();

        var payments = await db.Payments.AsNoTracking()
            .Where(p => p.IsCreditPayment && !p.IsVoided && p.CustomerId != null)
            .Where(p => businessUnitId == null || p.BusinessUnitId == businessUnitId)
            .Where(p => customerId == null || p.CustomerId == customerId)
            .Select(p => new { p.CustomerId, p.BusinessUnitId, p.Date, p.Amount })
            .ToListAsync();

        var takenBy = entries.ToLookup(e => (e.CustomerId, e.BusinessUnitId));
        var paidBy = payments.ToLookup(p => (CustomerId: p.CustomerId!.Value, p.BusinessUnitId));

        var keys = takenBy.Select(g => g.Key).Union(paidBy.Select(g => g.Key));
        var result = new List<CreditBalance>();
        foreach (var key in keys)
        {
            var taken = takenBy[key].OrderBy(t => t.Date).ThenBy(t => t.Id).ToList();
            var paid = paidBy[key].ToList();
            var totalTaken = taken.Sum(t => t.Amount);
            var totalPaid = paid.Sum(p => p.Amount);

            // FIFO: bayaran menutup hutang paling lama dahulu
            DateOnly? oldestUnpaid = null;
            var covered = totalPaid;
            foreach (var entry in taken)
            {
                if (covered >= entry.Amount)
                {
                    covered -= entry.Amount;
                    continue;
                }
                oldestUnpaid = entry.Date;
                break;
            }

            DateOnly? lastTaken = taken.Count > 0 ? taken.Max(t => t.Date) : null;
            DateOnly? lastPaid = paid.Count > 0 ? paid.Max(p => p.Date) : null;
            result.Add(new CreditBalance(
                key.CustomerId, key.BusinessUnitId, totalTaken, totalPaid,
                lastTaken, lastPaid, oldestUnpaid));
        }
        return result;
    }

    private async Task<decimal> BalanceAsync(int customerId, int businessUnitId) =>
        (await BalancesAsync(db, businessUnitId, customerId)).Sum(b => b.Balance);

    // =====================================================================
    // Senarai & lejar
    // =====================================================================

    public async Task<CreditBookSummaryDto> ListAsync(CreditBookQuery f)
    {
        var balances = await BalancesAsync(db, f.BusinessUnitId, f.CustomerId);

        var customerIds = balances.Select(b => b.CustomerId).Distinct().ToList();
        var customers = await db.Customers.AsNoTracking()
            .Where(c => customerIds.Contains(c.Id))
            .Select(c => new { c.Id, c.Name, c.Phone })
            .ToDictionaryAsync(c => c.Id);
        var units = await db.BusinessUnits.AsNoTracking()
            .Select(b => new { b.Id, b.Name })
            .ToDictionaryAsync(b => b.Id, b => b.Name);

        var all = balances
            .Where(b => customers.ContainsKey(b.CustomerId))
            .Select(b =>
            {
                var c = customers[b.CustomerId];
                return new CreditBookRow(
                    b.CustomerId, c.Name, c.Phone,
                    b.BusinessUnitId, units.GetValueOrDefault(b.BusinessUnitId, ""),
                    b.TotalTaken, b.TotalPaid, b.Balance,
                    b.LastTakenDate, b.LastPaidDate, b.OldestUnpaidDate);
            })
            .ToList();

        var owing = all.Where(r => r.Balance > 0).ToList();

        IEnumerable<CreditBookRow> rows = f.IncludeSettled ? all : owing;
        if (!string.IsNullOrWhiteSpace(f.Q))
        {
            var s = f.Q.Trim();
            rows = rows.Where(r => r.CustomerName.Contains(s, StringComparison.OrdinalIgnoreCase) ||
                                   (r.Phone != null && r.Phone.Contains(s, StringComparison.OrdinalIgnoreCase)));
        }

        return new CreditBookSummaryDto(
            owing.Sum(r => r.Balance),
            owing.Select(r => r.CustomerId).Distinct().Count(),
            rows.OrderByDescending(r => r.Balance).ThenBy(r => r.CustomerName).ToList());
    }

    public async Task<CreditLedgerDto> GetLedgerAsync(int customerId, int businessUnitId)
    {
        var c = await db.Customers.AsNoTracking().FirstOrDefaultAsync(x => x.Id == customerId) ?? throw new NotFoundException();
        var unit = await db.BusinessUnits.AsNoTracking().FirstOrDefaultAsync(x => x.Id == businessUnitId) ?? throw new NotFoundException();

        var entries = await db.CreditSales.AsNoTracking().Include(x => x.CreatedBy)
            .Where(x => x.CustomerId == customerId && x.BusinessUnitId == businessUnitId)
            .ToListAsync();
        var payments = await db.Payments.AsNoTracking().Include(x => x.CreatedBy)
            .Where(p => p.IsCreditPayment && p.CustomerId == customerId && p.BusinessUnitId == businessUnitId)
            .ToListAsync();

        var rows = entries
            .Select(e => (e.Date, e.CreatedAt, Sign: 1m, Line: new CreditLedgerLineDto(
                "Taken", e.Id, e.Date, e.Description, e.Amount, null,
                e.IsVoided, e.VoidReason, null, null, e.CreatedBy?.FullName ?? "", e.CreatedAt)))
            .Concat(payments.Select(p => (p.Date, p.CreatedAt, Sign: -1m, Line: new CreditLedgerLineDto(
                "Paid", p.Id, p.Date, p.Description ?? PaymentDescription, p.Amount, null,
                p.IsVoided, p.VoidReason, p.Number, p.Method, p.CreatedBy?.FullName ?? "", p.CreatedAt))))
            .OrderBy(x => x.Date).ThenBy(x => x.CreatedAt)
            .ToList();

        var running = 0m;
        var lines = new List<CreditLedgerLineDto>();
        foreach (var r in rows)
        {
            if (r.Line.IsVoided)
            {
                lines.Add(r.Line);
                continue;
            }
            running += r.Sign * r.Line.Amount;
            lines.Add(r.Line with { Balance = running });
        }

        var bal = (await BalancesAsync(db, businessUnitId, customerId)).FirstOrDefault();
        return new CreditLedgerDto(
            c.Id, c.Name, c.Phone, c.ContactPerson,
            unit.Id, unit.Name,
            bal?.TotalTaken ?? 0, bal?.TotalPaid ?? 0, bal?.Balance ?? 0,
            bal?.OldestUnpaidDate,
            lines);
    }

    // =====================================================================
    // Rekod hutang (ambil barang)
    // =====================================================================

    public async Task<int> AddEntryAsync(CreditSaleInput i)
    {
        var errors = new Dictionary<string, string[]>();
        var amount = Math.Round(i.Amount, 2);
        if (amount <= 0) AddError(errors, "amount", "Jumlah mesti lebih daripada 0.");
        if (i.Date == default) AddError(errors, "date", "Tarikh diperlukan.");
        else if (i.Date > Today) AddError(errors, "date", "Tarikh tidak boleh selepas hari ini.");
        if (string.IsNullOrWhiteSpace(i.Description)) AddError(errors, "description", "Tulis barang yang diambil.");
        if (!await db.Customers.AnyAsync(c => c.Id == i.CustomerId && c.IsActive))
            AddError(errors, "customerId", "Sila pilih pelanggan.");
        if (!await db.BusinessUnits.AnyAsync(b => b.Id == i.BusinessUnitId && b.IsActive))
            AddError(errors, "businessUnitId", "Sila pilih perniagaan.");
        ThrowIfAny(errors);

        var e = new CreditSale
        {
            CustomerId = i.CustomerId,
            BusinessUnitId = i.BusinessUnitId,
            Date = i.Date,
            Description = i.Description.Trim(),
            Amount = amount,
            CreatedById = user.Id,
        };
        db.CreditSales.Add(e);
        await db.SaveChangesAsync();

        audit.Log(AuditActions.Create, "CreditSale", e.Id, newValue: Snapshot(e));
        await db.SaveChangesAsync();
        return e.Id;
    }

    public async Task VoidEntryAsync(int id, string reason)
    {
        await WriteLock.WaitAsync();
        try
        {
            var e = await db.CreditSales.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
            if (e.IsVoided) throw new SalesException("Rekod hutang ini sudah dibatalkan.");

            var balance = await BalanceAsync(e.CustomerId, e.BusinessUnitId);
            if (balance - e.Amount < 0)
                throw new SalesException(
                    "Bayaran pelanggan ini sudah meliputi sebahagian hutang ini. " +
                    "Batalkan resit bayaran dahulu, kemudian batalkan rekod hutang ini.");

            e.IsVoided = true;
            e.VoidReason = reason.Trim();
            e.VoidedAt = DateTime.UtcNow;

            audit.Log(AuditActions.Void, "CreditSale", id, newValue: new { e.Amount, Reason = e.VoidReason });
            await db.SaveChangesAsync();
        }
        finally
        {
            WriteLock.Release();
        }
    }

    // =====================================================================
    // Terima bayaran → resit + Duit Masuk
    // =====================================================================

    public async Task<int> CreatePaymentAsync(CreditPaymentInput i)
    {
        await WriteLock.WaitAsync();
        try
        {
            await using var dbTx = await db.Database.BeginTransactionAsync();

            if (!await db.Customers.AnyAsync(c => c.Id == i.CustomerId))
                throw Field("customerId", "Pelanggan tidak dijumpai.");

            var amount = Math.Round(i.Amount, 2);
            var balance = await BalanceAsync(i.CustomerId, i.BusinessUnitId);
            if (balance <= 0)
                throw Field("amount", "Pelanggan ini tiada hutang dalam buku hutang perniagaan ini.");
            if (amount > balance)
                throw Field("amount", $"Melebihi baki hutang (RM{balance.ToString("N2", CultureInfo.InvariantCulture)}).");
            if (i.Date > Today)
                throw Field("date", "Tarikh tidak boleh selepas hari ini.");

            // Resit biasa: validasi akaun, kategori pendapatan, nombor RS dan rekod Duit Masuk
            var payment = await sales.BuildPaymentAsync(new PaymentInput(
                i.Date, i.BusinessUnitId, i.CustomerId, null, null,
                i.AccountId, i.CategoryId, i.Method, amount, i.Reference, PaymentDescription), null);
            payment.IsCreditPayment = true;
            await db.SaveChangesAsync();

            audit.Log(AuditActions.Create, "Payment", payment.Id, newValue: new
            {
                payment.Number, payment.Date, payment.Amount, payment.Method, payment.BusinessUnitId,
                payment.CustomerId, payment.AccountId, payment.CategoryId, CreditBook = true,
            });
            await db.SaveChangesAsync();

            await dbTx.CommitAsync();
            return payment.Id;
        }
        finally
        {
            WriteLock.Release();
        }
    }

    // =====================================================================
    // Helpers
    // =====================================================================

    private static object Snapshot(CreditSale e) => new { e.CustomerId, e.BusinessUnitId, e.Date, e.Description, e.Amount };

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
}
