using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fms.Api.Controllers;

/// <summary>Manage Employee (Pengurus & Kerani).</summary>
[ApiController]
[Route("api/employees")]
[Authorize(Policy = Policies.AnyUser)]
public class EmployeesController(StaffService staff) : SalesControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<EmployeeDto>> List([FromQuery] bool includeInactive = false) => staff.ListEmployeesAsync(includeInactive);

    [HttpGet("{id:int}")]
    public Task<ActionResult<EmployeeDto>> Get(int id) => Run(() => staff.GetEmployeeAsync(id));

    [HttpPost]
    public Task<ActionResult<EmployeeDto>> Create(EmployeeInput input) => Run(() => staff.SaveEmployeeAsync(null, input));

    [HttpPut("{id:int}")]
    public Task<ActionResult<EmployeeDto>> Update(int id, EmployeeInput input) => Run(() => staff.SaveEmployeeAsync(id, input));

    [HttpDelete("{id:int}")]
    public Task<IActionResult> Delete(int id) => RunNoContent(() => staff.DeleteEmployeeAsync(id));
}

/// <summary>Manage Employee Wages: bayar gaji (jana Duit Keluar) dan slip gaji.</summary>
[ApiController]
[Route("api/wages")]
[Authorize(Policy = Policies.AnyUser)]
public class WagesController(StaffService staff) : SalesControllerBase
{
    [HttpGet]
    public Task<ListResult<WageDto>> List([FromQuery] WageQuery query) => staff.ListWagesAsync(query);

    [HttpGet("{id:int}")]
    public Task<ActionResult<WageDto>> Get(int id) => Run(() => staff.GetWageAsync(id));

    [HttpPost]
    public Task<ActionResult<WageDto>> Pay(WageInput input) => Run(async () => await staff.GetWageAsync(await staff.PayWageAsync(input)));

    [HttpPost("{id:int}/void")]
    public Task<IActionResult> Void(int id, ReasonInput input) => RunNoContent(() => staff.VoidWageAsync(id, input.Reason));
}

/// <summary>Manage Utility Expenses: bil elektrik, air, internet, sewa ...</summary>
[ApiController]
[Route("api/utilities")]
[Authorize(Policy = Policies.AnyUser)]
public class UtilitiesController(StaffService staff) : SalesControllerBase
{
    [HttpGet]
    public Task<ListResult<UtilityDto>> List([FromQuery] UtilityQuery query) => staff.ListUtilitiesAsync(query);

    [HttpGet("{id:int}")]
    public Task<ActionResult<UtilityDto>> Get(int id) => Run(() => staff.GetUtilityAsync(id));

    [HttpPost]
    public Task<ActionResult<UtilityDto>> Create(UtilityInput input) => Run(async () => await staff.GetUtilityAsync(await staff.CreateUtilityAsync(input)));

    [HttpPut("{id:int}")]
    public Task<ActionResult<UtilityDto>> Update(int id, UtilityInput input) =>
        Run(async () =>
        {
            await staff.UpdateUtilityAsync(id, input);
            return await staff.GetUtilityAsync(id);
        });

    [HttpPost("{id:int}/pay")]
    public Task<ActionResult<UtilityDto>> Pay(int id, UtilityPayInput input) =>
        Run(async () =>
        {
            await staff.PayUtilityAsync(id, input);
            return await staff.GetUtilityAsync(id);
        });

    [HttpPost("{id:int}/unpay")]
    public Task<IActionResult> Unpay(int id, ReasonInput input) => RunNoContent(() => staff.UnpayUtilityAsync(id, input.Reason));

    [HttpDelete("{id:int}")]
    public Task<IActionResult> Delete(int id) => RunNoContent(() => staff.DeleteUtilityAsync(id));
}

/// <summary>
/// Tuntutan kewangan. Kerani: Manage Financial Claim Request.
/// Pengurus: View Financial Claim + Approve Financial Claim.
/// </summary>
[ApiController]
[Route("api/claims")]
[Authorize(Policy = Policies.AnyUser)]
public class ClaimsController(ClaimService claims) : SalesControllerBase
{
    [HttpGet]
    public Task<ListResult<ClaimDto>> List([FromQuery] ClaimQuery query) => claims.ListAsync(query);

    [HttpGet("{id:int}")]
    public Task<ActionResult<ClaimDto>> Get(int id) => Run(() => claims.GetAsync(id));

    [HttpPost, Authorize(Policy = Policies.Clerk)]
    public Task<ActionResult<ClaimDto>> Create(ClaimInput input) => Run(async () => await claims.GetAsync(await claims.CreateAsync(input)));

    [HttpPut("{id:int}"), Authorize(Policy = Policies.Clerk)]
    public Task<ActionResult<ClaimDto>> Update(int id, ClaimInput input) =>
        Run(async () =>
        {
            await claims.UpdateAsync(id, input);
            return await claims.GetAsync(id);
        });

    [HttpDelete("{id:int}"), Authorize(Policy = Policies.Clerk)]
    public Task<IActionResult> Delete(int id) => RunNoContent(() => claims.DeleteAsync(id));

    [HttpPost("{id:int}/receipt"), Authorize(Policy = Policies.Clerk)]
    [RequestSizeLimit(ClaimService.MaxReceiptBytes + 64 * 1024)]
    public Task<ActionResult<ClaimDto>> UploadReceipt(int id, IFormFile file) =>
        Run(async () =>
        {
            await claims.UploadReceiptAsync(id, file);
            return await claims.GetAsync(id);
        });

    [HttpGet("{id:int}/receipt")]
    public async Task<IActionResult> Receipt(int id)
    {
        try
        {
            var (path, type, name) = await claims.ReceiptAsync(id);
            return PhysicalFile(path, type, name);
        }
        catch (NotFoundException)
        {
            return NotFound();
        }
    }

    [HttpPost("{id:int}/review"), Authorize(Policy = Policies.Manager)]
    public Task<ActionResult<ClaimDto>> Review(int id, ClaimReviewInput input) =>
        Run(async () =>
        {
            await claims.ReviewAsync(id, input);
            return await claims.GetAsync(id);
        });

    [HttpPost("{id:int}/pay")]
    public Task<ActionResult<ClaimDto>> Pay(int id, ClaimPayInput input) =>
        Run(async () =>
        {
            await claims.PayAsync(id, input);
            return await claims.GetAsync(id);
        });

    [HttpPost("{id:int}/unpay")]
    public Task<IActionResult> Unpay(int id, ReasonInput input) => RunNoContent(() => claims.UnpayAsync(id, input.Reason));
}

/// <summary>Penyata Untung Rugi (View / Print P&amp;L), Laporan Jualan dan ringkasan.</summary>
[ApiController]
[Route("api/statements")]
[Authorize(Policy = Policies.AnyUser)]
public class StatementsController(StatementService statements, CurrentUser current) : SalesControllerBase
{
    [HttpGet("profit-loss")]
    public Task<ActionResult<ProfitLossDto>> ProfitLoss([FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromQuery] int? businessUnitId) =>
        Run(() =>
        {
            if (from == default || to == default || to < from) throw new SalesException("Pilih julat tarikh yang sah.");
            return statements.ProfitLossAsync(from, to, businessUnitId);
        });

    [HttpGet("sales")]
    public Task<ActionResult<SalesReportDto>> Sales([FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromQuery] string? groupBy,
        [FromQuery] int? businessUnitId) =>
        Run(() =>
        {
            if (from == default || to == default || to < from) throw new SalesException("Pilih julat tarikh yang sah.");
            return statements.SalesReportAsync(from, to, groupBy, businessUnitId);
        });

    [HttpGet("staff-summary")]
    public Task<StaffSummaryDto> StaffSummary() => statements.StaffSummaryAsync(current.Id, current.IsManager);
}
