using System.Globalization;
using System.Text;
using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Fms.Api.Controllers;

[ApiController]
[Route("api/transactions")]
[Authorize]
public class TransactionsController(AppDbContext db, CurrentUser current, AuditService audit) : ControllerBase
{
    private const int MaxPageSize = 200;

    [HttpGet]
    public async Task<PagedTransactions> List([FromQuery] TransactionQuery q)
    {
        var query = Filter(q);
        var total = await query.CountAsync();

        // SQLite tidak boleh SUM decimal, jadi jumlah dikira dalam memori.
        var amounts = await query.Select(t => new { t.Type, t.Amount }).ToListAsync();
        var totalIncome = amounts.Where(a => a.Type == TransactionType.Income).Sum(a => a.Amount);
        var totalExpense = amounts.Where(a => a.Type == TransactionType.Expense).Sum(a => a.Amount);

        var page = Math.Max(1, q.Page);
        var size = Math.Clamp(q.PageSize, 1, MaxPageSize);
        var items = await query
            .OrderByDescending(t => t.Date).ThenByDescending(t => t.Id)
            .Skip((page - 1) * size).Take(size)
            .Select(TransactionMapping.ToDto)
            .ToListAsync();

        return new PagedTransactions(items, total, page, size, totalIncome, totalExpense);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TransactionDto>> Get(int id)
    {
        var dto = await Scope().Where(t => t.Id == id).Select(TransactionMapping.ToDto).FirstOrDefaultAsync();
        return dto is null ? NotFound() : dto;
    }

    [HttpPost]
    public async Task<ActionResult<TransactionDto>> Create(TransactionInput input)
    {
        if (Ledger.SystemOnlyTypes.Contains(input.Type))
            return BadRequest(new { message = SystemOnlyMessage });

        var errors = await ValidateAsync(input);
        if (errors.Count > 0) return ValidationProblem(new ValidationProblemDetails(errors));

        var t = new Transaction { CreatedById = current.Id };
        Apply(t, input);
        db.Transactions.Add(t);
        await db.SaveChangesAsync();
        audit.Log(AuditActions.Create, "Transaction", t.Id, newValue: TransactionMapping.Snapshot(t));
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = t.Id },
            await db.Transactions.Where(x => x.Id == t.Id).Select(TransactionMapping.ToDto).FirstAsync());
    }

    [HttpPut("{id:int}"), Authorize(Policy = Policies.AnyUser)]
    public async Task<ActionResult<TransactionDto>> Update(int id, TransactionInput input)
    {
        var t = await db.Transactions.FindAsync(id);
        if (t is null) return NotFound();
        if (await LinkedSourceAsync(id) is string source)
            return BadRequest(new { message = $"Rekod ini dijana dari {source}. Batalkan di sana dan buat semula jika perlu ubah." });
        if (Ledger.SystemOnlyTypes.Contains(input.Type) || Ledger.SystemOnlyTypes.Contains(t.Type))
            return BadRequest(new { message = SystemOnlyMessage });

        var errors = await ValidateAsync(input);
        if (errors.Count > 0) return ValidationProblem(new ValidationProblemDetails(errors));

        var old = TransactionMapping.Snapshot(t);
        Apply(t, input);
        t.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Update, "Transaction", id, old, TransactionMapping.Snapshot(t));
        await db.SaveChangesAsync();

        return await db.Transactions.Where(x => x.Id == id).Select(TransactionMapping.ToDto).FirstAsync();
    }

    [HttpDelete("{id:int}"), Authorize(Policy = Policies.Manager)]
    public async Task<IActionResult> Delete(int id)
    {
        var t = await db.Transactions.FindAsync(id);
        if (t is null) return NotFound();
        if (await LinkedSourceAsync(id) is string source)
            return BadRequest(new { message = $"Rekod ini dijana dari {source}. Batalkan di sana." });
        t.IsDeleted = true;
        t.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Delete, "Transaction", id, TransactionMapping.Snapshot(t));
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("export"), Authorize(Policy = Policies.AnyUser)]
    public async Task<IActionResult> Export([FromQuery] TransactionQuery q)
    {
        var rows = await Filter(q).OrderBy(t => t.Date).ThenBy(t => t.Id).Select(TransactionMapping.ToDto).ToListAsync();
        var sb = new StringBuilder();
        sb.AppendLine("Tarikh,Jenis,Perniagaan,Ke Perniagaan,Akaun,Ke Akaun,Tunai/Bank,Kategori,Ahli Keluarga,Pelanggan/Pembekal,Rujukan,Catatan,Jumlah,Direkod Oleh");
        foreach (var r in rows)
        {
            sb.AppendJoin(',', new[]
            {
                r.Date.ToString("yyyy-MM-dd"), r.Type.ToString(), Csv(r.BusinessUnitName), Csv(r.ToBusinessUnitName),
                Csv(r.AccountName), Csv(r.ToAccountName), ChannelLabel(r.Channel), Csv(r.CategoryName), Csv(r.FamilyMemberName),
                Csv(r.Party), Csv(r.Reference), Csv(r.Description),
                r.Amount.ToString("0.00", CultureInfo.InvariantCulture), Csv(r.CreatedBy)
            });
            sb.AppendLine();
        }
        // BOM supaya Excel buka UTF-8 dengan betul
        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
        return File(bytes, "text/csv", $"rekod-{DateTime.Now:yyyyMMdd-HHmm}.csv");
    }

    // ------------------------------------------------------------------ helpers

    private const string SystemOnlyMessage =
        "Rekod pinjaman diurus melalui menu Hutang kita (Pinjaman). Sila guna menu tersebut.";

    /// <summary>Dokumen aktif yang menjana rekod ini (resit, bayaran hutang atau pinjaman), jika ada.</summary>
    private async Task<string?> LinkedSourceAsync(int transactionId)
    {
        var receipt = await db.Payments.Where(p => p.TransactionId == transactionId && !p.IsVoided)
            .Select(p => p.Number).FirstOrDefaultAsync();
        if (receipt is not null) return $"resit {receipt}";

        var voucher = await db.PayablePayments
            .Where(p => !p.IsVoided && (p.PrincipalTransactionId == transactionId || p.InterestTransactionId == transactionId))
            .Select(p => p.Number).FirstOrDefaultAsync();
        if (voucher is not null) return $"baucar bayaran {voucher}";

        var loan = await db.Payables.Where(p => p.ReceivedTransactionId == transactionId && p.Status != PayableStatus.Cancelled)
            .Select(p => p.Number).FirstOrDefaultAsync();
        if (loan is not null) return $"pinjaman {loan}";

        var wage = await db.Wages.Where(w => w.TransactionId == transactionId && !w.IsVoided).Select(w => w.Number).FirstOrDefaultAsync();
        if (wage is not null) return $"slip gaji {wage}";

        var bill = await db.UtilityBills.Where(u => u.TransactionId == transactionId).Select(u => u.Number).FirstOrDefaultAsync();
        if (bill is not null) return $"bil utiliti {bill}";

        var claim = await db.Claims.Where(c => c.TransactionId == transactionId).Select(c => c.Number).FirstOrDefaultAsync();
        return claim is not null ? $"tuntutan {claim}" : null;
    }

    /// <summary>Pekerja hanya nampak rekod yang dia sendiri masukkan.</summary>
    private IQueryable<Transaction> Scope()
    {
        var q = db.Transactions.AsNoTracking();
        return q;
    }

    private IQueryable<Transaction> Filter(TransactionQuery q)
    {
        var query = Scope();
        if (q.From is DateOnly from) query = query.Where(t => t.Date >= from);
        if (q.To is DateOnly to) query = query.Where(t => t.Date <= to);
        if (q.Type is TransactionType type) query = query.Where(t => t.Type == type);
        if (q.BusinessUnitId is int bu) query = query.Where(t => t.BusinessUnitId == bu || t.ToBusinessUnitId == bu);
        if (q.AccountId is int acc) query = query.Where(t => t.AccountId == acc || t.ToAccountId == acc);
        if (q.CategoryId is int cat) query = query.Where(t => t.CategoryId == cat);
        if (q.Channel is MoneyChannel ch) query = query.Where(t => t.Channel == ch);
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var s = q.Q.Trim();
            query = query.Where(t =>
                (t.Description != null && EF.Functions.Like(t.Description, $"%{s}%")) ||
                (t.Party != null && EF.Functions.Like(t.Party, $"%{s}%")) ||
                (t.Reference != null && EF.Functions.Like(t.Reference, $"%{s}%")));
        }
        return query;
    }

    private static void Apply(Transaction t, TransactionInput i)
    {
        t.Date = i.Date;
        t.Type = i.Type;
        t.Amount = Math.Round(i.Amount, 2);
        t.AccountId = i.AccountId;
        t.Party = Clean(i.Party);
        t.Reference = Clean(i.Reference);
        t.Description = Clean(i.Description);

        // Simpan hanya medan yang berkaitan dengan jenis rekod
        var rule = TransactionRules.For(i.Type);
        t.BusinessUnitId = rule.Business != FieldRule.Hidden ? i.BusinessUnitId : null;
        t.ToBusinessUnitId = rule.ToBusiness != FieldRule.Hidden ? i.ToBusinessUnitId : null;
        t.ToAccountId = rule.ToAccount != FieldRule.Hidden ? i.ToAccountId : null;
        t.CategoryId = rule.Category != FieldRule.Hidden ? i.CategoryId : null;
        t.FamilyMemberId = rule.FamilyMember != FieldRule.Hidden ? i.FamilyMemberId : null;
        t.Channel = rule.Channel != FieldRule.Hidden ? i.Channel : null;
    }

    private async Task<Dictionary<string, string[]>> ValidateAsync(TransactionInput i)
    {
        var err = new Dictionary<string, string[]>();
        if (!Enum.IsDefined(i.Type))
        {
            err[nameof(i.Type)] = ["Jenis rekod tidak sah."];
            return err;
        }
        void Add(string field, string msg) => err[field] = [msg];
        var rule = TransactionRules.For(i.Type);

        if (i.Amount <= 0) Add(nameof(i.Amount), "Jumlah mesti lebih daripada 0.");
        if (i.Date == default) Add(nameof(i.Date), "Tarikh diperlukan.");

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == i.AccountId && a.IsActive);
        if (account is null)
            Add(nameof(i.AccountId), "Sila pilih akaun.");
        // Akaun milik satu perniagaan hanya untuk rekod perniagaan itu (pindahan & pinjaman dalaman dikecualikan)
        else if (account.BusinessUnitId is int accountUnit && i.BusinessUnitId is int recordUnit && accountUnit != recordUnit &&
                 i.Type is not (TransactionType.Transfer or TransactionType.InternalLoan))
            Add(nameof(i.AccountId), "Akaun ini milik perniagaan lain.");

        if (rule.Channel == FieldRule.Required && (i.Channel is null || !Enum.IsDefined(i.Channel.Value)))
            Add(nameof(i.Channel), "Pilih Tunai atau Bank.");
        else if (i.Channel is MoneyChannel ch && !Enum.IsDefined(ch))
            Add(nameof(i.Channel), "Pilih Tunai atau Bank.");

        if (rule.Business == FieldRule.Required && i.BusinessUnitId is null)
            Add(nameof(i.BusinessUnitId), "Sila pilih perniagaan.");
        if (i.BusinessUnitId is int bu && rule.Business != FieldRule.Hidden && !await db.BusinessUnits.AnyAsync(b => b.Id == bu && b.IsActive))
            Add(nameof(i.BusinessUnitId), "Perniagaan tidak sah.");

        if (rule.ToBusiness == FieldRule.Required)
        {
            if (i.ToBusinessUnitId is not int tbu || !await db.BusinessUnits.AnyAsync(b => b.Id == tbu && b.IsActive))
                Add(nameof(i.ToBusinessUnitId), "Sila pilih perniagaan yang meminjam.");
            else if (tbu == i.BusinessUnitId)
                Add(nameof(i.ToBusinessUnitId), "Perniagaan pemberi dan peminjam mesti berbeza.");
        }

        if (rule.ToAccount == FieldRule.Required)
        {
            if (i.ToAccountId is not int ta || !await db.Accounts.AnyAsync(a => a.Id == ta && a.IsActive))
                Add(nameof(i.ToAccountId), "Sila pilih akaun destinasi.");
            else if (i.Type == TransactionType.Transfer && ta == i.AccountId)
                Add(nameof(i.ToAccountId), "Akaun asal dan destinasi mesti berbeza.");
        }

        if (rule.Category == FieldRule.Required)
        {
            var expected = i.Type == TransactionType.Income ? CategoryType.Income : CategoryType.Expense;
            var cat = i.CategoryId is int cid ? await db.Categories.FindAsync(cid) : null;
            if (cat is null || !cat.IsActive || cat.Type != expected)
                Add(nameof(i.CategoryId), "Sila pilih kategori.");
            else if (cat.BusinessUnitId is int cbu && cbu != i.BusinessUnitId)
                Add(nameof(i.CategoryId), "Kategori ini bukan untuk perniagaan yang dipilih.");
        }

        if (rule.FamilyMember == FieldRule.Required &&
            (i.FamilyMemberId is not int fm || !await db.FamilyMembers.AnyAsync(m => m.Id == fm && m.IsActive)))
            Add(nameof(i.FamilyMemberId), "Sila pilih ahli keluarga.");

        return err;
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string ChannelLabel(MoneyChannel? c) => c switch
    {
        MoneyChannel.Cash => "Tunai",
        MoneyChannel.Bank => "Bank",
        _ => "",
    };

    private static string Csv(string? s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        // Elak formula injection dalam Excel
        if ("=+-@".Contains(s[0])) s = "'" + s;
        return s.Contains(',') || s.Contains('"') || s.Contains('\n') ? $"\"{s.Replace("\"", "\"\"")}\"" : s;
    }
}
