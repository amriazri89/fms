using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Fms.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize(Policy = Policies.AnyUser)]
public class ReportsController(ReportService reports, AppDbContext db) : ControllerBase
{
    [HttpGet("dashboard")]
    public Task<DashboardDto> Dashboard([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int? businessUnitId) =>
        reports.DashboardAsync(from, to, businessUnitId);

    [HttpGet("reports/cashflow")]
    public Task<CashflowReportDto> Cashflow([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] int? accountId) =>
        reports.CashflowAsync(from, to, accountId);

    [HttpGet("reports/profit-by-business")]
    public Task<ProfitReportDto> ProfitByBusiness([FromQuery] DateOnly? from, [FromQuery] DateOnly? to) =>
        reports.ProfitByBusinessAsync(from, to);

    [HttpGet("reports/by-category")]
    public Task<CategoryReportDto> ByCategory([FromQuery] DateOnly? from, [FromQuery] DateOnly? to,
        [FromQuery] CategoryType type = CategoryType.Expense, [FromQuery] int? businessUnitId = null) =>
        reports.ByCategoryAsync(from, to, type, businessUnitId);

    [HttpGet("reports/monthly")]
    public Task<MonthlyReportDto> Monthly([FromQuery] int? year, [FromQuery] int? businessUnitId) =>
        reports.MonthlyAsync(year ?? reports.Today.Year, businessUnitId);

    [HttpGet("audit-logs"), Authorize(Policy = Policies.Manager)]
    public async Task<IEnumerable<AuditLogDto>> AuditLogs([FromQuery] string? entity, [FromQuery] int take = 200)
    {
        var q = db.AuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(entity)) q = q.Where(a => a.Entity == entity);
        return await q.OrderByDescending(a => a.Id).Take(Math.Clamp(take, 1, 1000))
            .Select(a => new AuditLogDto(a.Id, a.Timestamp, a.Username, a.Action, a.Entity, a.EntityId, a.OldValue, a.NewValue))
            .ToListAsync();
    }
}
