using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fms.Api.Controllers;

/// <summary>Tukar SalesException / NotFoundException kepada respons HTTP yang betul.</summary>
public abstract class SalesControllerBase : ControllerBase
{
    protected async Task<ActionResult<T>> Run<T>(Func<Task<T>> action)
    {
        try
        {
            return new ActionResult<T>(await action());
        }
        catch (NotFoundException)
        {
            return NotFound();
        }
        catch (SalesException ex)
        {
            return ToError(ex);
        }
    }

    protected async Task<IActionResult> RunNoContent(Func<Task> action)
    {
        try
        {
            await action();
            return NoContent();
        }
        catch (NotFoundException)
        {
            return NotFound();
        }
        catch (SalesException ex)
        {
            return ToError(ex);
        }
    }

    private ActionResult ToError(SalesException ex) =>
        ex.Errors.Count > 0
            ? ValidationProblem(new ValidationProblemDetails(ex.Errors))
            : BadRequest(new { message = ex.Message });
}

[ApiController]
[Route("api/document-settings")]
[Authorize]
public class DocumentSettingsController(SalesService sales) : ControllerBase
{
    [HttpGet]
    public DocumentSettingsDto Get() => sales.Settings();
}

[ApiController]
[Route("api/customers")]
[Authorize]
public class CustomersController(SalesService sales) : SalesControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<CustomerListItem>> List([FromQuery] string? q, [FromQuery] bool includeInactive = false) =>
        sales.ListCustomersAsync(q, includeInactive);

    [HttpGet("{id:int}")]
    public Task<ActionResult<CustomerDetailDto>> Get(int id) => Run(() => sales.GetCustomerAsync(id));

    [HttpPost]
    public Task<ActionResult<CustomerDto>> Create(CustomerInput input) => Run(() => sales.SaveCustomerAsync(null, input));

    [HttpPut("{id:int}")]
    public Task<ActionResult<CustomerDto>> Update(int id, CustomerInput input) => Run(() => sales.SaveCustomerAsync(id, input));

    [HttpDelete("{id:int}"), Authorize(Policy = Policies.AnyUser)]
    public Task<IActionResult> Delete(int id) => RunNoContent(() => sales.DeleteCustomerAsync(id));

    [HttpGet("follow-ups")]
    public Task<IReadOnlyList<CustomerActivityDto>> FollowUps() => sales.FollowUpsAsync();

    [HttpPost("{id:int}/activities")]
    public Task<ActionResult<CustomerActivityDto>> AddActivity(int id, CustomerActivityInput input) =>
        Run(() => sales.AddActivityAsync(id, input));

    [HttpPost("activities/{activityId:int}/done")]
    public Task<IActionResult> MarkDone(int activityId, [FromQuery] bool done = true) =>
        RunNoContent(() => sales.SetFollowUpDoneAsync(activityId, done));

    [HttpDelete("activities/{activityId:int}")]
    public Task<IActionResult> DeleteActivity(int activityId) => RunNoContent(() => sales.DeleteActivityAsync(activityId));
}

[ApiController]
[Route("api/quotations")]
[Authorize]
public class QuotationsController(SalesService sales) : SalesControllerBase
{
    [HttpGet]
    public Task<PagedResult<QuotationListItem>> List([FromQuery] SalesQuery query) => sales.ListQuotationsAsync(query);

    [HttpGet("{id:int}")]
    public Task<ActionResult<QuotationDto>> Get(int id) => Run(() => sales.GetQuotationAsync(id));

    [HttpPost]
    public Task<ActionResult<QuotationDto>> Create(QuotationInput input) =>
        Run(async () => await sales.GetQuotationAsync(await sales.CreateQuotationAsync(input)));

    [HttpPut("{id:int}")]
    public Task<ActionResult<QuotationDto>> Update(int id, QuotationInput input) =>
        Run(async () =>
        {
            await sales.UpdateQuotationAsync(id, input);
            return await sales.GetQuotationAsync(id);
        });

    [HttpPost("{id:int}/status")]
    public Task<ActionResult<QuotationDto>> SetStatus(int id, QuotationStatusInput input) =>
        Run(async () =>
        {
            await sales.SetQuotationStatusAsync(id, input.Status);
            return await sales.GetQuotationAsync(id);
        });

    [HttpPost("{id:int}/convert")]
    public Task<ActionResult<InvoiceDto>> ConvertToInvoice(int id) =>
        Run(async () => await sales.GetInvoiceAsync(await sales.ConvertToInvoiceAsync(id)));

    [HttpDelete("{id:int}"), Authorize(Policy = Policies.AnyUser)]
    public Task<IActionResult> Delete(int id) => RunNoContent(() => sales.DeleteQuotationAsync(id));
}

[ApiController]
[Route("api/invoices")]
[Authorize]
public class InvoicesController(SalesService sales) : SalesControllerBase
{
    [HttpGet]
    public Task<PagedResult<InvoiceListItem>> List([FromQuery] SalesQuery query) => sales.ListInvoicesAsync(query);

    [HttpGet("{id:int}")]
    public Task<ActionResult<InvoiceDto>> Get(int id) => Run(() => sales.GetInvoiceAsync(id));

    [HttpPost]
    public Task<ActionResult<InvoiceDto>> Create(InvoiceInput input) =>
        Run(async () => await sales.GetInvoiceAsync(await sales.CreateInvoiceAsync(input)));

    [HttpPut("{id:int}")]
    public Task<ActionResult<InvoiceDto>> Update(int id, InvoiceInput input) =>
        Run(async () =>
        {
            await sales.UpdateInvoiceAsync(id, input);
            return await sales.GetInvoiceAsync(id);
        });

    [HttpPost("{id:int}/cancel"), Authorize(Policy = Policies.AnyUser)]
    public Task<IActionResult> Cancel(int id, ReasonInput input) => RunNoContent(() => sales.CancelInvoiceAsync(id, input.Reason));
}

[ApiController]
[Route("api/receipts")]
[Authorize]
public class ReceiptsController(SalesService sales) : SalesControllerBase
{
    [HttpGet]
    public Task<PagedResult<PaymentListItem>> List([FromQuery] SalesQuery query) => sales.ListReceiptsAsync(query);

    [HttpGet("{id:int}")]
    public Task<ActionResult<ReceiptDto>> Get(int id) => Run(() => sales.GetReceiptAsync(id));

    [HttpPost]
    public Task<ActionResult<ReceiptDto>> Create(PaymentInput input) =>
        Run(async () => await sales.GetReceiptAsync(await sales.CreatePaymentAsync(input)));

    [HttpPost("{id:int}/void"), Authorize(Policy = Policies.AnyUser)]
    public Task<IActionResult> Void(int id, ReasonInput input) => RunNoContent(() => sales.VoidPaymentAsync(id, input.Reason));
}
