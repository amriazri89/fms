using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Fms.Api.Controllers;

// Semua pengguna yang log masuk boleh baca senarai (diperlukan untuk borang rekod).
// Hanya pentadbir boleh tambah / ubah / padam.
// Jika rekod sudah digunakan, "padam" akan menyahaktifkan sahaja supaya sejarah kekal.

[ApiController]
[Route("api/business-units")]
[Authorize]
public class BusinessUnitsController(AppDbContext db, AuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<BusinessUnitDto>> List([FromQuery] bool includeInactive = false) =>
        await db.BusinessUnits.AsNoTracking()
            .Where(x => includeInactive || x.IsActive)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
            .Select(x => new BusinessUnitDto(x.Id, x.Name, x.Description, x.Color, x.SortOrder, x.IsActive,
                x.LegalName, x.RegistrationNo, x.Address, x.Phone, x.Email, x.PaymentInfo, x.DocumentFooter))
            .ToListAsync();

    [HttpPost, Authorize(Policy = Policies.Manager)]
    public async Task<ActionResult<BusinessUnitDto>> Create(BusinessUnitInput input)
    {
        if (await db.BusinessUnits.AnyAsync(x => x.Name == input.Name.Trim()))
            return Conflict(new { message = "Nama perniagaan sudah wujud." });
        var e = new BusinessUnit();
        Apply(e, input);
        db.BusinessUnits.Add(e);
        await db.SaveChangesAsync();
        audit.Log(AuditActions.Create, "BusinessUnit", e.Id, newValue: input);
        await db.SaveChangesAsync();
        return ToDto(e);
    }

    [HttpPut("{id:int}"), Authorize(Policy = Policies.Manager)]
    public async Task<ActionResult<BusinessUnitDto>> Update(int id, BusinessUnitInput input)
    {
        var e = await db.BusinessUnits.FindAsync(id);
        if (e is null) return NotFound();
        if (await db.BusinessUnits.AnyAsync(x => x.Id != id && x.Name == input.Name.Trim()))
            return Conflict(new { message = "Nama perniagaan sudah wujud." });
        var old = ToDto(e);
        Apply(e, input);
        audit.Log(AuditActions.Update, "BusinessUnit", id, old, input);
        await db.SaveChangesAsync();
        return ToDto(e);
    }

    [HttpDelete("{id:int}"), Authorize(Policy = Policies.Manager)]
    public async Task<IActionResult> Delete(int id)
    {
        var e = await db.BusinessUnits.FindAsync(id);
        if (e is null) return NotFound();
        var used = await db.Transactions.IgnoreQueryFilters().AnyAsync(t => t.BusinessUnitId == id || t.ToBusinessUnitId == id)
                   || await db.Categories.AnyAsync(c => c.BusinessUnitId == id)
                   || await db.Accounts.AnyAsync(a => a.BusinessUnitId == id)
                   || await db.Quotations.AnyAsync(q => q.BusinessUnitId == id)
                   || await db.Invoices.AnyAsync(i => i.BusinessUnitId == id)
                   || await db.Payments.AnyAsync(p => p.BusinessUnitId == id);
        if (used) e.IsActive = false; else db.BusinessUnits.Remove(e);
        audit.Log(AuditActions.Delete, "BusinessUnit", id, ToDto(e), new { deactivatedOnly = used });
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static void Apply(BusinessUnit e, BusinessUnitInput i)
    {
        e.Name = i.Name.Trim(); e.Description = i.Description; e.Color = i.Color; e.SortOrder = i.SortOrder; e.IsActive = i.IsActive;
        e.LegalName = Clean(i.LegalName); e.RegistrationNo = Clean(i.RegistrationNo); e.Address = Clean(i.Address);
        e.Phone = Clean(i.Phone); e.Email = Clean(i.Email); e.PaymentInfo = Clean(i.PaymentInfo); e.DocumentFooter = Clean(i.DocumentFooter);
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static BusinessUnitDto ToDto(BusinessUnit x) => new(x.Id, x.Name, x.Description, x.Color, x.SortOrder, x.IsActive,
        x.LegalName, x.RegistrationNo, x.Address, x.Phone, x.Email, x.PaymentInfo, x.DocumentFooter);
}

[ApiController]
[Route("api/accounts")]
[Authorize]
public class AccountsController(AppDbContext db, AuditService audit, ReportService reports) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<AccountDto>> List([FromQuery] bool includeInactive = false) =>
        await db.Accounts.AsNoTracking()
            .Where(x => includeInactive || x.IsActive)
            .OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
            .Select(x => new AccountDto(x.Id, x.Name, x.Type, x.OpeningBalance, x.OpeningCash, x.OpeningBank, x.BusinessUnitId, x.SortOrder, x.IsActive))
            .ToListAsync();

    [HttpGet("balances"), Authorize(Policy = Policies.AnyUser)]
    public Task<IReadOnlyList<AccountBalanceDto>> Balances() => reports.BalancesAsync();

    [HttpPost, Authorize(Policy = Policies.Manager)]
    public async Task<ActionResult<AccountDto>> Create(AccountInput input)
    {
        if (await db.Accounts.AnyAsync(x => x.Name == input.Name.Trim()))
            return Conflict(new { message = "Nama akaun sudah wujud." });
        var e = new Account();
        Apply(e, input);
        db.Accounts.Add(e);
        await db.SaveChangesAsync();
        audit.Log(AuditActions.Create, "Account", e.Id, newValue: input);
        await db.SaveChangesAsync();
        return ToDto(e);
    }

    [HttpPut("{id:int}"), Authorize(Policy = Policies.Manager)]
    public async Task<ActionResult<AccountDto>> Update(int id, AccountInput input)
    {
        var e = await db.Accounts.FindAsync(id);
        if (e is null) return NotFound();
        if (await db.Accounts.AnyAsync(x => x.Id != id && x.Name == input.Name.Trim()))
            return Conflict(new { message = "Nama akaun sudah wujud." });
        var old = ToDto(e);
        Apply(e, input);
        audit.Log(AuditActions.Update, "Account", id, old, input);
        await db.SaveChangesAsync();
        return ToDto(e);
    }

    [HttpDelete("{id:int}"), Authorize(Policy = Policies.Manager)]
    public async Task<IActionResult> Delete(int id)
    {
        var e = await db.Accounts.FindAsync(id);
        if (e is null) return NotFound();
        var used = await db.Transactions.IgnoreQueryFilters().AnyAsync(t => t.AccountId == id || t.ToAccountId == id)
                   || await db.Payments.AnyAsync(p => p.AccountId == id);
        if (used) e.IsActive = false; else db.Accounts.Remove(e);
        audit.Log(AuditActions.Delete, "Account", id, ToDto(e), new { deactivatedOnly = used });
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static void Apply(Account e, AccountInput i)
    {
        e.Name = i.Name.Trim(); e.Type = i.Type;
        // Baki awal Tunai + Bank. Jumlah disimpan juga kerana semua laporan baki guna OpeningBalance.
        e.OpeningCash = Math.Round(i.OpeningCash, 2);
        e.OpeningBank = Math.Round(i.OpeningBank, 2);
        e.OpeningBalance = e.OpeningCash + e.OpeningBank;
        e.BusinessUnitId = i.BusinessUnitId; e.SortOrder = i.SortOrder; e.IsActive = i.IsActive;
    }

    private static AccountDto ToDto(Account x) => new(x.Id, x.Name, x.Type, x.OpeningBalance, x.OpeningCash, x.OpeningBank,
        x.BusinessUnitId, x.SortOrder, x.IsActive);
}

[ApiController]
[Route("api/categories")]
[Authorize]
public class CategoriesController(AppDbContext db, AuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<CategoryDto>> List([FromQuery] bool includeInactive = false) =>
        await db.Categories.AsNoTracking()
            .Where(x => includeInactive || x.IsActive)
            .OrderBy(x => x.Type).ThenBy(x => x.BusinessUnitId).ThenBy(x => x.SortOrder).ThenBy(x => x.Name)
            .Select(x => new CategoryDto(x.Id, x.Name, x.Type, x.BusinessUnitId, x.SortOrder, x.IsActive))
            .ToListAsync();

    [HttpPost, Authorize(Policy = Policies.Manager)]
    public async Task<ActionResult<CategoryDto>> Create(CategoryInput input)
    {
        var e = new Category();
        Apply(e, input);
        db.Categories.Add(e);
        await db.SaveChangesAsync();
        audit.Log(AuditActions.Create, "Category", e.Id, newValue: input);
        await db.SaveChangesAsync();
        return ToDto(e);
    }

    [HttpPut("{id:int}"), Authorize(Policy = Policies.Manager)]
    public async Task<ActionResult<CategoryDto>> Update(int id, CategoryInput input)
    {
        var e = await db.Categories.FindAsync(id);
        if (e is null) return NotFound();
        if (e.Type != input.Type && await db.Transactions.IgnoreQueryFilters().AnyAsync(t => t.CategoryId == id))
            return BadRequest(new { message = "Jenis kategori tidak boleh ditukar kerana sudah digunakan dalam rekod." });
        var old = ToDto(e);
        Apply(e, input);
        audit.Log(AuditActions.Update, "Category", id, old, input);
        await db.SaveChangesAsync();
        return ToDto(e);
    }

    [HttpDelete("{id:int}"), Authorize(Policy = Policies.Manager)]
    public async Task<IActionResult> Delete(int id)
    {
        var e = await db.Categories.FindAsync(id);
        if (e is null) return NotFound();
        var used = await db.Transactions.IgnoreQueryFilters().AnyAsync(t => t.CategoryId == id)
                   || await db.Payments.AnyAsync(p => p.CategoryId == id);
        if (used) e.IsActive = false; else db.Categories.Remove(e);
        audit.Log(AuditActions.Delete, "Category", id, ToDto(e), new { deactivatedOnly = used });
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static void Apply(Category e, CategoryInput i)
    {
        e.Name = i.Name.Trim(); e.Type = i.Type; e.BusinessUnitId = i.BusinessUnitId; e.SortOrder = i.SortOrder; e.IsActive = i.IsActive;
    }

    private static CategoryDto ToDto(Category x) => new(x.Id, x.Name, x.Type, x.BusinessUnitId, x.SortOrder, x.IsActive);
}

[ApiController]
[Route("api/family-members")]
[Authorize]
public class FamilyMembersController(AppDbContext db, AuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<FamilyMemberDto>> List([FromQuery] bool includeInactive = false) =>
        await db.FamilyMembers.AsNoTracking()
            .Where(x => includeInactive || x.IsActive)
            .OrderBy(x => x.Name)
            .Select(x => new FamilyMemberDto(x.Id, x.Name, x.Relationship, x.IsActive))
            .ToListAsync();

    [HttpPost, Authorize(Policy = Policies.Manager)]
    public async Task<ActionResult<FamilyMemberDto>> Create(FamilyMemberInput input)
    {
        var e = new FamilyMember { Name = input.Name.Trim(), Relationship = input.Relationship, IsActive = input.IsActive };
        db.FamilyMembers.Add(e);
        await db.SaveChangesAsync();
        audit.Log(AuditActions.Create, "FamilyMember", e.Id, newValue: input);
        await db.SaveChangesAsync();
        return ToDto(e);
    }

    [HttpPut("{id:int}"), Authorize(Policy = Policies.Manager)]
    public async Task<ActionResult<FamilyMemberDto>> Update(int id, FamilyMemberInput input)
    {
        var e = await db.FamilyMembers.FindAsync(id);
        if (e is null) return NotFound();
        var old = ToDto(e);
        e.Name = input.Name.Trim(); e.Relationship = input.Relationship; e.IsActive = input.IsActive;
        audit.Log(AuditActions.Update, "FamilyMember", id, old, input);
        await db.SaveChangesAsync();
        return ToDto(e);
    }

    [HttpDelete("{id:int}"), Authorize(Policy = Policies.Manager)]
    public async Task<IActionResult> Delete(int id)
    {
        var e = await db.FamilyMembers.FindAsync(id);
        if (e is null) return NotFound();
        var used = await db.Transactions.IgnoreQueryFilters().AnyAsync(t => t.FamilyMemberId == id);
        if (used) e.IsActive = false; else db.FamilyMembers.Remove(e);
        audit.Log(AuditActions.Delete, "FamilyMember", id, ToDto(e), new { deactivatedOnly = used });
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static FamilyMemberDto ToDto(FamilyMember x) => new(x.Id, x.Name, x.Relationship, x.IsActive);
}
