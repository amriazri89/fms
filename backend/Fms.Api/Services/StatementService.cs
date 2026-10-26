using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fms.Api.Services;

/// <summary>
/// Penyata Untung Rugi (boleh dicetak), Laporan Jualan dan ringkasan pekerja/tuntutan.
///
/// Penyata dikira terus daripada rekod duit (asas tunai), sama seperti skrin Ringkasan:
///   Hasil      = Duit Masuk (Income) ikut kategori
///   Belanja    = Duit Keluar (Expense) ikut kategori: termasuk gaji, bil utiliti,
///                tuntutan yang dibayar, bil pembekal yang dibayar dan faedah pinjaman
///   Untung bersih = Hasil − Belanja
/// Ambilan keluarga, modal, pindahan dan pinjaman tidak dikira (ditunjuk berasingan).
/// </summary>
public class StatementService(AppDbContext db, IOptions<AppOptions> options)
{
    private readonly AppOptions _opt = options.Value;
    private DateOnly Today => Clock.Today(_opt.TimeZone);
    private static readonly string[] Months = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"];

    private async Task<(List<Transaction> Rows, Dictionary<int, string> Categories, List<BusinessUnit> Units, string Scope)> LoadAsync(
        DateOnly from, DateOnly to, int? businessUnitId)
    {
        var q = db.Transactions.AsNoTracking().Where(t => t.Date >= from && t.Date <= to);
        if (businessUnitId is int b) q = q.Where(t => t.BusinessUnitId == b);
        var rows = await q.ToListAsync();
        var cats = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);
        var units = await db.BusinessUnits.AsNoTracking().OrderBy(u => u.SortOrder).ToListAsync();
        var scope = businessUnitId is int id ? units.FirstOrDefault(u => u.Id == id)?.Name ?? "?" : "Semua perniagaan";
        return (rows, cats, units, scope);
    }

    private static StatementSection Section(string title, IEnumerable<Transaction> rows, Dictionary<int, string> cats)
    {
        var lines = rows.GroupBy(t => t.CategoryId is int c ? cats.GetValueOrDefault(c, "Lain-lain") : "Tanpa kategori")
            .Select(g => new StatementLine(g.Key, g.Sum(t => t.Amount)))
            .OrderByDescending(l => l.Amount).ToList();
        return new StatementSection(title, lines, lines.Sum(l => l.Amount));
    }

    public async Task<ProfitLossDto> ProfitLossAsync(DateOnly from, DateOnly to, int? businessUnitId)
    {
        var (rows, cats, units, scope) = await LoadAsync(from, to, businessUnitId);
        var income = rows.Where(t => t.Type == TransactionType.Income).ToList();
        var expense = rows.Where(t => t.Type == TransactionType.Expense).ToList();
        var revenue = Section("Hasil", income, cats);
        var expenses = Section("Perbelanjaan", expense, cats);
        var net = revenue.Total - expenses.Total;

        var byBusiness = businessUnitId is null
            ? units.Select(u => new
                {
                    u,
                    r = income.Where(t => t.BusinessUnitId == u.Id).Sum(t => t.Amount),
                    e = expense.Where(t => t.BusinessUnitId == u.Id).Sum(t => t.Amount),
                })
                .Where(x => x.r != 0 || x.e != 0)
                .Select(x => new StatementBusiness(x.u.Id, x.u.Name, x.r, x.e, x.r - x.e)).ToList()
            : new List<StatementBusiness>();

        var monthly = new List<StatementMonth>();
        var months = (to.Year - from.Year) * 12 + to.Month - from.Month + 1;
        if (months <= 24)
        {
            for (var m = new DateOnly(from.Year, from.Month, 1); m <= to; m = m.AddMonths(1))
            {
                var r = income.Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month).Sum(t => t.Amount);
                var e = expense.Where(t => t.Date.Year == m.Year && t.Date.Month == m.Month).Sum(t => t.Amount);
                monthly.Add(new StatementMonth($"{m.Year:D4}-{m.Month:D2}", $"{Months[m.Month - 1]} {m.Year}", r, e, r - e));
            }
        }

        var notCountedTypes = new (TransactionType Type, string Label)[]
        {
            (TransactionType.OwnerWithdrawal, "Ambilan keluarga"),
            (TransactionType.OwnerCapital, "Modal masuk"),
            (TransactionType.LoanIn, "Pinjaman diterima"),
            (TransactionType.LoanRepayment, "Bayar balik pinjaman (pokok)"),
        };
        var notCountedLines = notCountedTypes
            .Select(n => new StatementLine(n.Label, rows.Where(t => t.Type == n.Type).Sum(t => t.Amount)))
            .Where(l => l.Amount != 0).ToList();

        return new ProfitLossDto(from, to, businessUnitId, scope, revenue, expenses, net,
            revenue.Total > 0 ? Math.Round(net / revenue.Total * 100, 1) : null, byBusiness, monthly,
            new StatementSection("Tidak dikira dalam untung rugi", notCountedLines, notCountedLines.Sum(l => l.Amount)),
            _opt.CompanyName, DateTime.UtcNow);
    }

    public async Task<SalesReportDto> SalesReportAsync(DateOnly from, DateOnly to, string? groupBy, int? businessUnitId)
    {
        var mode = groupBy == "month" ? "month" : "day";
        var (rows, cats, units, scope) = await LoadAsync(from, to, businessUnitId);
        var sales = rows.Where(t => t.Type == TransactionType.Income).ToList();
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id, a => a.Name);
        var unitNames = units.ToDictionary(u => u.Id, u => u.Name);

        var grouped = mode == "month"
            ? sales.GroupBy(t => $"{t.Date.Year:D4}-{t.Date.Month:D2}").OrderBy(g => g.Key)
                .Select(g => new SalesReportRow(g.Key, $"{Months[int.Parse(g.Key[5..]) - 1]} {g.Key[..4]}", g.Count(), g.Sum(t => t.Amount))).ToList()
            : sales.GroupBy(t => t.Date).OrderBy(g => g.Key)
                .Select(g => new SalesReportRow(g.Key.ToString("yyyy-MM-dd"), $"{g.Key.Day} {Months[g.Key.Month - 1]} {g.Key.Year}", g.Count(), g.Sum(t => t.Amount))).ToList();

        List<SalesReportRow> By(Func<Transaction, string> key) => sales.GroupBy(key)
            .Select(g => new SalesReportRow(g.Key, g.Key, g.Count(), g.Sum(t => t.Amount)))
            .OrderByDescending(r => r.Total).ToList();

        var invQ = db.Invoices.AsNoTracking().Where(i => i.Status != InvoiceStatus.Cancelled);
        if (businessUnitId is int b) invQ = invQ.Where(i => i.BusinessUnitId == b);
        var invoices = await invQ.Select(i => new { i.Date, i.Total, i.AmountPaid }).ToListAsync();

        var total = sales.Sum(t => t.Amount);
        var lastDay = to < Today ? to : Today;
        var days = Math.Max(1, lastDay.DayNumber - from.DayNumber + 1);

        return new SalesReportDto(from, to, businessUnitId, scope, mode, sales.Count, total, Math.Round(total / days, 2), grouped,
            By(t => t.CategoryId is int c ? cats.GetValueOrDefault(c, "Lain-lain") : "Tanpa kategori"),
            By(t => t.BusinessUnitId is int u ? unitNames.GetValueOrDefault(u, "?") : "Tiada perniagaan"),
            By(t => accounts.GetValueOrDefault(t.AccountId, "?")),
            invoices.Where(i => i.Date >= from && i.Date <= to).Sum(i => i.Total),
            invoices.Sum(i => i.Total - i.AmountPaid),
            _opt.CompanyName);
    }

    public async Task<StaffSummaryDto> StaffSummaryAsync(int currentUserId, bool isManager)
    {
        var today = Today;
        var month = $"{today.Year:D4}-{today.Month:D2}";
        var claimsQ = db.Claims.AsNoTracking().Include(x => x.RequestedBy).Include(x => x.Employee).Include(x => x.ReviewedBy)
            .Include(x => x.BusinessUnit).Include(x => x.Category).Include(x => x.PaidAccount)
            .Where(x => x.Status == ClaimStatus.Pending || x.Status == ClaimStatus.Approved);
        if (!isManager) claimsQ = claimsQ.Where(x => x.RequestedById == currentUserId);
        var claims = await claimsQ.OrderBy(x => x.ClaimDate).ToListAsync();
        var pending = claims.Where(c => c.Status == ClaimStatus.Pending).ToList();
        var approved = claims.Where(c => c.Status == ClaimStatus.Approved).ToList();

        var bills = await db.UtilityBills.AsNoTracking().Where(u => u.Status == UtilityBillStatus.Unpaid)
            .Select(u => new { u.Amount, u.DueDate }).ToListAsync();
        var active = await db.Employees.AsNoTracking().Where(e => e.IsActive).Select(e => e.Id).ToListAsync();
        var paidThisMonth = await db.Wages.AsNoTracking().Where(w => !w.IsVoided && w.PeriodMonth == month).Select(w => w.EmployeeId).ToListAsync();

        return new StaffSummaryDto(pending.Count, pending.Sum(c => c.Amount), approved.Count, approved.Sum(c => c.Amount),
            bills.Count, bills.Sum(b => b.Amount), bills.Count(b => b.DueDate < today), active.Count,
            active.Count(id => !paidThisMonth.Contains(id)),
            pending.Take(5).Select(ClaimService.ToDto).ToList());
    }
}
