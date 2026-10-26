using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fms.Api.Services;

/// <summary>
/// Tuntutan kewangan.
///   Kerani : mohon, ubah / padam semasa masih menunggu, lampir resit (Manage Financial Claim Request).
///   Pengurus: lihat semua tuntutan & resit, lulus atau tolak (View / Approve Financial Claim).
///   Bayar balik: selepas lulus, rekod bayaran → Duit Keluar dicipta dengan kategori tuntutan.
/// </summary>
public class ClaimService(
    AppDbContext db,
    CurrentUser user,
    AuditService audit,
    StaffService staff,
    IOptions<DocumentOptions> documentOptions,
    IOptions<AppOptions> appOptions,
    IWebHostEnvironment env)
{
    private readonly DocumentOptions _doc = documentOptions.Value;
    public const long MaxReceiptBytes = 5 * 1024 * 1024;

    private static readonly Dictionary<string, string> ReceiptTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png", [".webp"] = "image/webp", [".pdf"] = "application/pdf",
    };

    private string UploadDir
    {
        get
        {
            var folder = appOptions.Value.UploadFolder;
            var dir = Path.Combine(Path.IsPathRooted(folder) ? folder : Path.Combine(env.ContentRootPath, folder), "claims");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    private IQueryable<FinancialClaim> Query() => db.Claims.AsNoTracking()
        .Include(x => x.RequestedBy).Include(x => x.Employee).Include(x => x.ReviewedBy)
        .Include(x => x.BusinessUnit).Include(x => x.Category).Include(x => x.PaidAccount);

    public async Task<ListResult<ClaimDto>> ListAsync(ClaimQuery f)
    {
        var q = Query();
        // Kerani nampak tuntutan sendiri; Pengurus nampak semua
        if (!user.IsManager) q = q.Where(x => x.RequestedById == user.Id);
        if (Enum.TryParse<ClaimStatus>(f.Status, true, out var st)) q = q.Where(x => x.Status == st);
        if (f.From is DateOnly from) q = q.Where(x => x.ClaimDate >= from);
        if (f.To is DateOnly to) q = q.Where(x => x.ClaimDate <= to);
        var rows = await q.OrderByDescending(x => x.ClaimDate).ThenByDescending(x => x.Id).ToListAsync();
        return new ListResult<ClaimDto>(rows.Select(ToDto).ToList(), rows.Count, rows.Sum(x => x.Amount));
    }

    public async Task<ClaimDto> GetAsync(int id)
    {
        var x = await Query().FirstOrDefaultAsync(c => c.Id == id) ?? throw new NotFoundException();
        if (!user.IsManager && x.RequestedById != user.Id) throw new NotFoundException();
        return ToDto(x);
    }

    public async Task<int> CreateAsync(ClaimInput i)
    {
        await ValidateAsync(i);
        await DocumentNumbers.WriteLock.WaitAsync();
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var c = new FinancialClaim { RequestedById = user.Id, Status = ClaimStatus.Pending };
            Apply(c, i);
            c.Number = await DocumentNumbers.NextAsync(db, _doc, DocumentType.Claim, c.ClaimDate);
            db.Claims.Add(c);
            await db.SaveChangesAsync();
            audit.Log(AuditActions.Create, "Claim", c.Id, newValue: new { c.Number, c.Amount, c.Description });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return c.Id;
        }
        finally
        {
            DocumentNumbers.WriteLock.Release();
        }
    }

    public async Task UpdateAsync(int id, ClaimInput i)
    {
        var c = await OwnPendingAsync(id);
        await ValidateAsync(i);
        Apply(c, i);
        c.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Update, "Claim", id, newValue: new { c.Amount, c.Description });
        await db.SaveChangesAsync();
    }

    public async Task DeleteAsync(int id)
    {
        var c = await OwnPendingAsync(id);
        DeleteFile(c.ReceiptFile);
        db.Claims.Remove(c);
        audit.Log(AuditActions.Delete, "Claim", id, new { c.Number, c.Amount });
        await db.SaveChangesAsync();
    }

    public async Task ReviewAsync(int id, ClaimReviewInput input)
    {
        var c = await db.Claims.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (c.Status != ClaimStatus.Pending) throw new SalesException("Tuntutan ini sudah disemak.");
        if (!input.Approve && string.IsNullOrWhiteSpace(input.Remark))
            throw new SalesException("Nyatakan sebab tuntutan ditolak.", new Dictionary<string, string[]> { ["remark"] = ["Nyatakan sebab tuntutan ditolak."] });
        c.Status = input.Approve ? ClaimStatus.Approved : ClaimStatus.Rejected;
        c.ReviewedById = user.Id;
        c.ReviewedAt = DateTime.UtcNow;
        c.ReviewRemark = StaffService.Clean(input.Remark);
        audit.Log(input.Approve ? AuditActions.Approve : AuditActions.Reject, "Claim", id, newValue: new { c.Number, c.ReviewRemark });
        await db.SaveChangesAsync();
    }

    /// <summary>Bayar balik tuntutan yang diluluskan → Duit Keluar.</summary>
    public async Task PayAsync(int id, ClaimPayInput pay)
    {
        var c = await db.Claims.Include(x => x.Employee).Include(x => x.RequestedBy).FirstOrDefaultAsync(x => x.Id == id)
                ?? throw new NotFoundException();
        if (c.Status != ClaimStatus.Approved) throw new SalesException("Hanya tuntutan yang diluluskan boleh dibayar.");
        var v = new Check();
        staff.CheckPay(v, pay.PaidDate, pay.Method);
        v.Field(await db.Accounts.AnyAsync(a => a.Id == pay.AccountId && a.IsActive), "accountId", "Pilih akaun bayar.");
        v.ThrowIfAny();

        var claimant = c.Employee?.Name ?? c.RequestedBy?.FullName;
        c.Status = ClaimStatus.Paid;
        c.PaidDate = pay.PaidDate;
        c.PaidAccountId = pay.AccountId;
        c.Method = pay.Method;
        c.Transaction = staff.Expense(pay.PaidDate, c.Amount, c.BusinessUnitId, pay.AccountId, c.CategoryId, claimant, c.Number,
            $"Tuntutan {c.Number}: {c.Description}");
        c.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Update, "Claim", id, newValue: new { Paid = pay.PaidDate, pay.AccountId });
        await db.SaveChangesAsync();
    }

    /// <summary>Batal bayaran balik: tuntutan kembali "diluluskan", Duit Keluar dibuang.</summary>
    public async Task UnpayAsync(int id, string reason)
    {
        var c = await db.Claims.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (c.Status != ClaimStatus.Paid) throw new SalesException("Tuntutan ini belum dibayar.");
        await staff.RemoveTransactionAsync(c.TransactionId);
        c.TransactionId = null;
        c.Status = ClaimStatus.Approved;
        c.PaidDate = null;
        c.PaidAccountId = null;
        c.Method = null;
        c.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Void, "Claim", id, newValue: new { c.Number, Reason = reason.Trim() });
        await db.SaveChangesAsync();
    }

    public async Task UploadReceiptAsync(int id, IFormFile file)
    {
        var c = await OwnPendingAsync(id);
        var ext = Path.GetExtension(file.FileName);
        if (!ReceiptTypes.ContainsKey(ext))
            throw new SalesException("Resit mesti fail JPG, PNG, WEBP atau PDF.", new Dictionary<string, string[]> { ["file"] = ["Resit mesti fail JPG, PNG, WEBP atau PDF."] });
        if (file.Length == 0 || file.Length > MaxReceiptBytes)
            throw new SalesException("Saiz resit mesti kurang daripada 5 MB.", new Dictionary<string, string[]> { ["file"] = ["Saiz resit mesti kurang daripada 5 MB."] });

        var name = $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
        await using (var stream = File.Create(Path.Combine(UploadDir, name)))
            await file.CopyToAsync(stream);
        DeleteFile(c.ReceiptFile);
        c.ReceiptFile = name;
        c.ReceiptOriginalName = Path.GetFileName(file.FileName);
        c.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    public async Task<(string Path, string ContentType, string Name)> ReceiptAsync(int id)
    {
        var c = await db.Claims.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if ((!user.IsManager && c.RequestedById != user.Id) || c.ReceiptFile is null) throw new NotFoundException();
        var path = Path.Combine(UploadDir, Path.GetFileName(c.ReceiptFile));
        if (!File.Exists(path)) throw new NotFoundException();
        return (path, ReceiptTypes.GetValueOrDefault(Path.GetExtension(path), "application/octet-stream"), c.ReceiptOriginalName ?? c.ReceiptFile);
    }

    private async Task<FinancialClaim> OwnPendingAsync(int id)
    {
        var c = await db.Claims.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (c.RequestedById != user.Id) throw new NotFoundException();
        if (c.Status != ClaimStatus.Pending) throw new SalesException("Hanya tuntutan yang masih menunggu kelulusan boleh diubah.");
        return c;
    }

    private async Task ValidateAsync(ClaimInput i)
    {
        var v = new Check()
            .Field(i.ClaimDate != default, "claimDate", "Tarikh diperlukan.")
            .Field(i.ClaimDate <= Clock.Today(appOptions.Value.TimeZone), "claimDate", "Tarikh tidak boleh pada masa depan.")
            .Field(!string.IsNullOrWhiteSpace(i.Description), "description", "Nyatakan perbelanjaan.")
            .Field(i.Amount > 0, "amount", "Jumlah mesti lebih daripada 0.");
        if (i.EmployeeId is int e)
            v.Field(await db.Employees.AnyAsync(x => x.Id == e && x.IsActive), "employeeId", "Pekerja tidak dijumpai.");
        await staff.CheckMoneyFieldsAsync(v, i.BusinessUnitId, null, i.CategoryId);
        v.ThrowIfAny();
    }

    private static void Apply(FinancialClaim c, ClaimInput i)
    {
        c.EmployeeId = i.EmployeeId;
        c.ClaimDate = i.ClaimDate;
        c.BusinessUnitId = i.BusinessUnitId;
        c.CategoryId = i.CategoryId;
        c.Description = i.Description.Trim();
        c.Amount = Math.Round(i.Amount, 2);
    }

    private void DeleteFile(string? name)
    {
        if (name is null) return;
        var path = Path.Combine(UploadDir, Path.GetFileName(name));
        if (File.Exists(path)) File.Delete(path);
    }

    internal static ClaimDto ToDto(FinancialClaim x) => new(
        x.Id, x.Number, x.RequestedById, x.RequestedBy?.FullName ?? "", x.EmployeeId, x.Employee?.Name ?? x.RequestedBy?.FullName ?? "",
        x.ClaimDate, x.BusinessUnitId, x.BusinessUnit?.Name ?? "", x.CategoryId, x.Category?.Name ?? "", x.Description, x.Amount,
        x.ReceiptFile != null, x.ReceiptOriginalName, x.Status, x.ReviewedBy?.FullName, x.ReviewedAt, x.ReviewRemark,
        x.PaidDate, x.PaidAccount?.Name, x.Method, x.CreatedAt);
}
