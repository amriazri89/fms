using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fms.Api.Controllers;

/// <summary>Agihan hasil sawit: pemilik, jenis caj, bayaran kilang, bayaran pemilik.</summary>
[ApiController]
[Route("api/palm")]
[Authorize]
public class PalmController(PalmService palm) : SalesControllerBase
{
    // ---------- Pemilik ----------
    [HttpGet("owners")]
    public Task<IReadOnlyList<PalmOwnerDto>> Owners([FromQuery] bool includeInactive = false) => palm.ListOwnersAsync(includeInactive);

    [HttpPost("owners")]
    public Task<ActionResult<int>> CreateOwner(PalmOwnerInput input) => Run(() => palm.SaveOwnerAsync(null, input));

    [HttpPut("owners/{id:int}")]
    public Task<ActionResult<int>> UpdateOwner(int id, PalmOwnerInput input) => Run(() => palm.SaveOwnerAsync(id, input));

    [HttpDelete("owners/{id:int}"), Authorize(Policy = Policies.Manager)]
    public Task<IActionResult> DeleteOwner(int id) => RunNoContent(() => palm.DeleteOwnerAsync(id));

    // ---------- Jenis caj (Pengurus) ----------
    [HttpGet("charge-types")]
    public Task<IReadOnlyList<PalmChargeTypeDto>> ChargeTypes([FromQuery] bool includeInactive = false) => palm.ListChargeTypesAsync(includeInactive);

    [HttpPost("charge-types"), Authorize(Policy = Policies.Manager)]
    public Task<ActionResult<int>> CreateChargeType(PalmChargeTypeInput input) => Run(() => palm.SaveChargeTypeAsync(null, input));

    [HttpPut("charge-types/{id:int}"), Authorize(Policy = Policies.Manager)]
    public Task<ActionResult<int>> UpdateChargeType(int id, PalmChargeTypeInput input) => Run(() => palm.SaveChargeTypeAsync(id, input));

    [HttpDelete("charge-types/{id:int}"), Authorize(Policy = Policies.Manager)]
    public Task<IActionResult> DeleteChargeType(int id) => RunNoContent(() => palm.DeleteChargeTypeAsync(id));

    // ---------- Bayaran kilang ----------
    [HttpGet("batches")]
    public Task<PalmSummaryDto> Batches([FromQuery] PalmBatchQuery query) => palm.ListAsync(query);

    [HttpGet("batches/{id:int}")]
    public Task<ActionResult<PalmBatchDto>> Batch(int id) => Run(() => palm.GetAsync(id));

    [HttpPost("batches")]
    public Task<ActionResult<PalmBatchDto>> Create(PalmBatchInput input) =>
        Run(async () => await palm.GetAsync(await palm.CreateAsync(input)));

    [HttpPut("batches/{id:int}")]
    public Task<ActionResult<PalmBatchDto>> Update(int id, PalmBatchInput input) =>
        Run(async () =>
        {
            await palm.UpdateAsync(id, input);
            return await palm.GetAsync(id);
        });

    [HttpDelete("batches/{id:int}")]
    public Task<IActionResult> DeleteDraft(int id) => RunNoContent(() => palm.DeleteDraftAsync(id));

    [HttpPost("batches/{id:int}/post")]
    public Task<ActionResult<PalmBatchDto>> Post(int id) =>
        Run(async () =>
        {
            await palm.PostAsync(id);
            return await palm.GetAsync(id);
        });

    [HttpPost("batches/{id:int}/reopen"), Authorize(Policy = Policies.Manager)]
    public Task<ActionResult<PalmBatchDto>> Reopen(int id) =>
        Run(async () =>
        {
            await palm.ReopenAsync(id);
            return await palm.GetAsync(id);
        });

    [HttpPost("batches/{id:int}/cancel"), Authorize(Policy = Policies.Manager)]
    public Task<IActionResult> Cancel(int id, ReasonInput input) => RunNoContent(() => palm.CancelAsync(id, input.Reason));

    // ---------- Bayar pemilik ----------
    [HttpPost("payouts")]
    public Task<ActionResult<PalmPayoutDto>> Pay(PalmPayoutInput input) => Run(() => palm.PayAsync(input));

    [HttpPost("payouts/{id:int}/void"), Authorize(Policy = Policies.Manager)]
    public Task<IActionResult> VoidPayout(int id, ReasonInput input) => RunNoContent(() => palm.VoidPayoutAsync(id, input.Reason));
}
