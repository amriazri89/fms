using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fms.Api.Services;

/// <summary>
/// Semua kiraan untuk skrin utama dan laporan.
///
/// Nota: SQLite tidak menyokong SUM/ORDER BY pada kolum decimal, jadi rekod ditapis
/// mengikut tarikh di pangkalan data dan dijumlahkan dalam memori. Untuk saiz data
/// perniagaan keluarga (ribuan rekod setahun) ini sangat pantas.
/// </summary>
public class ReportService(AppDbContext db, IOptions<AppOptions> options)
{
    private readonly AppOptions _opt = options.Value;

    public DateOnly Today => Clock.Today(_opt.TimeZone);

    public PeriodDto ResolvePeriod(DateOnly? from, DateOnly? to)
    {
        var today = Today;
        var f = from ?? new DateOnly(today.Year, today.Month, 1);
        var t = to ?? today;
        if (t < f) (f, t) = (t, f);
        return new PeriodDto(f, t);
    }

    private Task<List<Transaction>> LoadAsync(DateOnly? from, DateOnly to) =>
        db.Transactions.AsNoTracking()
            .Where(t => t.Date <= to && (from == null || t.Date >= from))
            .ToListAsync();

    // ---------------------------------------------------------------- Dashboard

    public async Task<DashboardDto> DashboardAsync(DateOnly? from, DateOnly? to, int? businessUnitId)
    {
        var period = ResolvePeriod(from, to);
        var units = await db.BusinessUnits.AsNoTracking().OrderBy(b => b.SortOrder).ToListAsync();
        var accounts = await db.Accounts.AsNoTracking().Where(a => a.IsActive).OrderBy(a => a.SortOrder).ToListAsync();
        var categories = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);
        var members = await db.FamilyMembers.AsNoTracking().ToDictionaryAsync(m => m.Id, m => m.Name);

        var trendStart = new DateOnly(period.To.Year, period.To.Month, 1).AddMonths(-5);
        var all = await LoadAsync(null, period.To);
        var inPeriod = all.Where(t => t.Date >= period.From).ToList();
        var scoped = businessUnitId is int bu ? inPeriod.Where(t => t.BusinessUnitId == bu).ToList() : inPeriod;

        var businesses = ProfitRows(units, scoped, businessUnitId);

        var balances = Balances(accounts, all);
        var accountDtos = accounts.Select(a => new AccountBalanceDto(a.Id, a.Name, a.Type, balances[a.Id], balances[a.Id] < _opt.LowBalanceThreshold)).ToList();

        var income = scoped.Where(t => t.Type == TransactionType.Income).Sum(t => t.Amount);
        var expense = scoped.Where(t => t.Type == TransactionType.Expense).Sum(t => t.Amount);
        var withdrawals = scoped.Where(t => t.Type == TransactionType.OwnerWithdrawal).Sum(t => t.Amount);
        var capital = scoped.Where(t => t.Type == TransactionType.OwnerCapital).Sum(t => t.Amount);

        var expenseByCategory = scoped
            .Where(t => t.Type == TransactionType.Expense && t.CategoryId != null)
            .GroupBy(t => t.CategoryId!.Value)
            .Select(g => new NamedAmountDto(categories.GetValueOrDefault(g.Key, "?"), g.Sum(t => t.Amount)))
            .OrderByDescending(x => x.Amount).ToList();

        var withdrawalsByMember = scoped
            .Where(t => t.Type == TransactionType.OwnerWithdrawal && t.FamilyMemberId != null)
            .GroupBy(t => t.FamilyMemberId!.Value)
            .Select(g => new NamedAmountDto(members.GetValueOrDefault(g.Key, "?"), g.Sum(t => t.Amount)))
            .OrderByDescending(x => x.Amount).ToList();

        var trendSource = all.Where(t => t.Date >= trendStart && (businessUnitId == null || t.BusinessUnitId == businessUnitId));
        var trend = Monthly(trendSource, trendStart, 6);

        var recentQuery = db.Transactions.AsNoTracking().AsQueryable();
        if (businessUnitId is int b2) recentQuery = recentQuery.Where(t => t.BusinessUnitId == b2 || t.ToBusinessUnitId == b2);
        var recent = await recentQuery.OrderByDescending(t => t.Date).ThenByDescending(t => t.Id).Take(8)
            .Select(TransactionMapping.ToDto).ToListAsync();

        return new DashboardDto(
            period,
            new TotalsDto(income, expense, income - expense, withdrawals, capital, accountDtos.Sum(a => a.Balance)),
            businesses,
            accountDtos,
            expenseByCategory,
            trend,
            InternalLoans(units, all),
            withdrawalsByMember,
            recent,
            await ReceivablesAsync(businessUnitId),
            await PayablesSummaryAsync(businessUnitId));
    }

    /// <summary>Kita hutang orang: baki bil pembekal & pinjaman yang belum lunas.</summary>
    public async Task<PayablesSummaryDto> PayablesSummaryAsync(int? businessUnitId)
    {
        var today = Today;
        var open = await db.Payables.AsNoTracking()
            .Include(p => p.Supplier).Include(p => p.BusinessUnit)
            .Where(p => (p.Status == PayableStatus.Unpaid || p.Status == PayableStatus.PartiallyPaid) &&
                        (businessUnitId == null || p.BusinessUnitId == businessUnitId))
            .ToListAsync();

        var upcoming = open.OrderBy(p => p.DueDate).ThenBy(p => p.Id).Take(5)
            .Select(p => PayablesService.ToListItem(p, today)).ToList();

        return new PayablesSummaryDto(
            open.Sum(p => p.Amount - p.AmountPaid),
            open.Where(p => p.DueDate < today).Sum(p => p.Amount - p.AmountPaid),
            open.Count,
            open.Where(p => p.DueDate <= today.AddDays(30)).Sum(p => p.Amount - p.AmountPaid),
            upcoming);
    }

    /// <summary>Orang hutang kita: baki invois yang belum dibayar penuh.</summary>
    public async Task<ReceivablesDto> ReceivablesAsync(int? businessUnitId)
    {
        var today = Today;
        var open = await db.Invoices.AsNoTracking()
            .Where(i => (i.Status == InvoiceStatus.Unpaid || i.Status == InvoiceStatus.PartiallyPaid) &&
                        (businessUnitId == null || i.BusinessUnitId == businessUnitId))
            .Select(i => new { i.CustomerId, CustomerName = i.Customer!.Name, i.Total, i.AmountPaid, i.DueDate })
            .ToListAsync();

        var top = open.GroupBy(i => new { i.CustomerId, i.CustomerName })
            .Select(g => new ReceivableItemDto(g.Key.CustomerId, g.Key.CustomerName,
                g.Sum(i => i.Total - i.AmountPaid), g.Count(i => i.DueDate < today)))
            .OrderByDescending(x => x.Outstanding)
            .Take(5)
            .ToList();

        return new ReceivablesDto(
            open.Sum(i => i.Total - i.AmountPaid),
            open.Where(i => i.DueDate < today).Sum(i => i.Total - i.AmountPaid),
            open.Count,
            top);
    }

    // ---------------------------------------------------------------- Reports

    public async Task<CashflowReportDto> CashflowAsync(DateOnly? from, DateOnly? to, int? accountId)
    {
        var period = ResolvePeriod(from, to);
        var accountsQuery = db.Accounts.AsNoTracking().AsQueryable();
        if (accountId is int id) accountsQuery = accountsQuery.Where(a => a.Id == id);
        var accounts = await accountsQuery.ToListAsync();
        var ids = accounts.Select(a => a.Id).ToHashSet();
        var all = await LoadAsync(null, period.To);

        decimal NetEffect(Transaction t) => Ledger.AccountEffects(t).Where(e => ids.Contains(e.AccountId)).Sum(e => e.Delta);

        var opening = accounts.Sum(a => a.OpeningBalance) + all.Where(t => t.Date < period.From).Sum(t => NetEffect(t));

        var inLines = new Dictionary<TransactionType, decimal>();
        var outLines = new Dictionary<TransactionType, decimal>();
        foreach (var t in all.Where(t => t.Date >= period.From))
        {
            var net = NetEffect(t);
            if (net > 0) inLines[t.Type] = inLines.GetValueOrDefault(t.Type) + net;
            else if (net < 0) outLines[t.Type] = outLines.GetValueOrDefault(t.Type) - net;
        }

        var totalIn = inLines.Values.Sum();
        var totalOut = outLines.Values.Sum();
        var scope = accountId is null ? "Semua akaun" : accounts.FirstOrDefault()?.Name ?? "?";

        return new CashflowReportDto(period, scope, opening,
            inLines.OrderBy(k => k.Key).Select(k => new CashflowLineDto(k.Key, k.Value)).ToList(),
            outLines.OrderBy(k => k.Key).Select(k => new CashflowLineDto(k.Key, k.Value)).ToList(),
            totalIn, totalOut, totalIn - totalOut, opening + totalIn - totalOut);
    }

    public async Task<ProfitReportDto> ProfitByBusinessAsync(DateOnly? from, DateOnly? to)
    {
        var period = ResolvePeriod(from, to);
        var units = await db.BusinessUnits.AsNoTracking().OrderBy(b => b.SortOrder).ToListAsync();
        var tx = await LoadAsync(period.From, period.To);
        var rows = ProfitRows(units, tx, null);
        return new ProfitReportDto(period, rows, rows.Sum(r => r.Income), rows.Sum(r => r.Expense), rows.Sum(r => r.Profit));
    }

    public async Task<CategoryReportDto> ByCategoryAsync(DateOnly? from, DateOnly? to, CategoryType type, int? businessUnitId)
    {
        var period = ResolvePeriod(from, to);
        var categories = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);
        var txType = type == CategoryType.Income ? TransactionType.Income : TransactionType.Expense;
        var tx = (await LoadAsync(period.From, period.To))
            .Where(t => t.Type == txType && t.CategoryId != null && (businessUnitId == null || t.BusinessUnitId == businessUnitId));
        var rows = tx.GroupBy(t => t.CategoryId!.Value)
            .Select(g => new NamedAmountDto(categories.GetValueOrDefault(g.Key, "?"), g.Sum(t => t.Amount)))
            .OrderByDescending(r => r.Amount).ToList();
        return new CategoryReportDto(period, type, rows, rows.Sum(r => r.Amount));
    }

    public async Task<MonthlyReportDto> MonthlyAsync(int year, int? businessUnitId)
    {
        var start = new DateOnly(year, 1, 1);
        var end = new DateOnly(year, 12, 31);
        var tx = (await LoadAsync(start, end)).Where(t => businessUnitId == null || t.BusinessUnitId == businessUnitId);
        var months = Monthly(tx, start, 12);
        return new MonthlyReportDto(year, months, months.Sum(m => m.Income), months.Sum(m => m.Expense), months.Sum(m => m.Profit));
    }

    public async Task<IReadOnlyList<AccountBalanceDto>> BalancesAsync()
    {
        var accounts = await db.Accounts.AsNoTracking().Where(a => a.IsActive).OrderBy(a => a.SortOrder).ToListAsync();
        var balances = Balances(accounts, await LoadAsync(null, Today));
        return accounts.Select(a => new AccountBalanceDto(a.Id, a.Name, a.Type, balances[a.Id], balances[a.Id] < _opt.LowBalanceThreshold)).ToList();
    }

    // ---------------------------------------------------------------- helpers

    private static Dictionary<int, decimal> Balances(IEnumerable<Account> accounts, IEnumerable<Transaction> tx)
    {
        var bal = accounts.ToDictionary(a => a.Id, a => a.OpeningBalance);
        foreach (var t in tx)
            foreach (var (acc, delta) in Ledger.AccountEffects(t))
                if (bal.ContainsKey(acc)) bal[acc] += delta;
        return bal;
    }

    private static List<BusinessProfitDto> ProfitRows(IEnumerable<BusinessUnit> units, IEnumerable<Transaction> tx, int? onlyUnit)
    {
        var byUnit = tx.Where(t => t.BusinessUnitId != null).ToLookup(t => t.BusinessUnitId!.Value);
        return units
            .Where(u => onlyUnit == null || u.Id == onlyUnit)
            .Select(u =>
            {
                var list = byUnit[u.Id];
                var inc = list.Where(t => t.Type == TransactionType.Income).Sum(t => t.Amount);
                var exp = list.Where(t => t.Type == TransactionType.Expense).Sum(t => t.Amount);
                var wd = list.Where(t => t.Type == TransactionType.OwnerWithdrawal).Sum(t => t.Amount);
                return new BusinessProfitDto(u.Id, u.Name, u.Color, inc, exp, inc - exp, wd);
            })
            .Where(r => r.Income != 0 || r.Expense != 0 || r.Withdrawals != 0 || onlyUnit != null)
            .ToList();
    }

    private static List<MonthlyPointDto> Monthly(IEnumerable<Transaction> tx, DateOnly firstMonth, int count)
    {
        var grouped = tx.Where(t => Ledger.CountsAsProfit(t.Type))
            .GroupBy(t => (t.Date.Year, t.Date.Month))
            .ToDictionary(g => g.Key, g => (
                Income: g.Where(t => t.Type == TransactionType.Income).Sum(t => t.Amount),
                Expense: g.Where(t => t.Type == TransactionType.Expense).Sum(t => t.Amount)));

        var result = new List<MonthlyPointDto>(count);
        for (var i = 0; i < count; i++)
        {
            var m = firstMonth.AddMonths(i);
            var (inc, exp) = grouped.GetValueOrDefault((m.Year, m.Month));
            result.Add(new MonthlyPointDto($"{m.Year:D4}-{m.Month:D2}", inc, exp, inc - exp));
        }
        return result;
    }

    private static List<InternalLoanDto> InternalLoans(IEnumerable<BusinessUnit> units, IEnumerable<Transaction> tx)
    {
        var names = units.ToDictionary(u => u.Id, u => u.Name);
        var net = new Dictionary<(int A, int B), decimal>(); // positif = A beri pinjam kepada B

        foreach (var t in tx.Where(t => t.Type == TransactionType.InternalLoan && t.BusinessUnitId != null && t.ToBusinessUnitId != null))
        {
            int lender = t.BusinessUnitId!.Value, borrower = t.ToBusinessUnitId!.Value;
            var key = lender < borrower ? (lender, borrower) : (borrower, lender);
            var sign = lender < borrower ? 1 : -1;
            net[key] = net.GetValueOrDefault(key) + sign * t.Amount;
        }

        return net.Where(kv => kv.Value != 0).Select(kv =>
        {
            var (a, b) = kv.Key;
            var (lender, borrower) = kv.Value > 0 ? (a, b) : (b, a);
            return new InternalLoanDto(lender, names.GetValueOrDefault(lender, "?"), borrower, names.GetValueOrDefault(borrower, "?"), Math.Abs(kv.Value));
        }).OrderByDescending(x => x.Outstanding).ToList();
    }
}
