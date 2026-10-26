using Fms.Api.Domain;
using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fms.Api.Controllers;

/// <summary>Pembekal / pemiutang. Pemilik & admin sahaja.</summary>
[ApiController]
[Route("api/suppliers")]
[Authorize(Policy = Policies.AnyUser)]
public class SuppliersController(PayablesService payables) : SalesControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<SupplierListItem>> List([FromQuery] string? q, [FromQuery] bool includeInactive = false) =>
        payables.ListSuppliersAsync(q, includeInactive);

    [HttpGet("{id:int}")]
    public Task<ActionResult<SupplierDetailDto>> Get(int id) => Run(() => payables.GetSupplierAsync(id));

    [HttpPost]
    public Task<ActionResult<SupplierDto>> Create(SupplierInput input) => Run(() => payables.SaveSupplierAsync(null, input));

    [HttpPut("{id:int}")]
    public Task<ActionResult<SupplierDto>> Update(int id, SupplierInput input) => Run(() => payables.SaveSupplierAsync(id, input));

    [HttpDelete("{id:int}")]
    public Task<IActionResult> Delete(int id) => RunNoContent(() => payables.DeleteSupplierAsync(id));
}

/// <summary>Hutang kita (bil pembekal & pinjaman) serta bayarannya.</summary>
[ApiController]
[Route("api/payables")]
[Authorize(Policy = Policies.AnyUser)]
public class PayablesController(PayablesService payables) : SalesControllerBase
{
    [HttpGet]
    public Task<PagedResult<PayableListItem>> List([FromQuery] PayableQuery query) => payables.ListAsync(query);

    [HttpGet("{id:int}")]
    public Task<ActionResult<PayableDto>> Get(int id) => Run(() => payables.GetAsync(id));

    [HttpPost]
    public Task<ActionResult<PayableDto>> Create(PayableInput input) =>
        Run(async () => await payables.GetAsync(await payables.CreateAsync(input)));

    [HttpPut("{id:int}")]
    public Task<ActionResult<PayableDto>> Update(int id, PayableInput input) =>
        Run(async () =>
        {
            await payables.UpdateAsync(id, input);
            return await payables.GetAsync(id);
        });

    [HttpPost("{id:int}/cancel")]
    public Task<IActionResult> Cancel(int id, ReasonInput input) => RunNoContent(() => payables.CancelAsync(id, input.Reason));

    [HttpPost("{id:int}/payments")]
    public Task<ActionResult<PaymentVoucherDto>> Pay(int id, PayablePaymentInput input) =>
        Run(async () => await payables.GetVoucherAsync(await payables.PayAsync(id, input)));

    [HttpGet("payments/{paymentId:int}")]
    public Task<ActionResult<PaymentVoucherDto>> Voucher(int paymentId) => Run(() => payables.GetVoucherAsync(paymentId));

    [HttpPost("payments/{paymentId:int}/void")]
    public Task<IActionResult> VoidPayment(int paymentId, ReasonInput input) =>
        RunNoContent(() => payables.VoidPaymentAsync(paymentId, input.Reason));
}
