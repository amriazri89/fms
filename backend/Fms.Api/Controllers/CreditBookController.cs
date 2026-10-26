using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Fms.Api.Controllers;

/// <summary>Buku hutang kedai (555).</summary>
[ApiController]
[Route("api/credit-book")]
[Authorize]
public class CreditBookController(CreditBookService book, SalesService sales) : SalesControllerBase
{
    [HttpGet]
    public Task<CreditBookSummaryDto> List([FromQuery] CreditBookQuery query) => book.ListAsync(query);

    [HttpGet("{customerId:int}/{businessUnitId:int}")]
    public Task<ActionResult<CreditLedgerDto>> Ledger(int customerId, int businessUnitId) =>
        Run(() => book.GetLedgerAsync(customerId, businessUnitId));

    /// <summary>Pelanggan ambil barang (rekod hutang).</summary>
    [HttpPost("entries")]
    public Task<ActionResult<CreditLedgerDto>> AddEntry(CreditSaleInput input) =>
        Run(async () =>
        {
            await book.AddEntryAsync(input);
            return await book.GetLedgerAsync(input.CustomerId, input.BusinessUnitId);
        });

    [HttpPost("entries/{id:int}/void"), Authorize(Policy = Policies.AnyUser)]
    public Task<IActionResult> VoidEntry(int id, ReasonInput input) => RunNoContent(() => book.VoidEntryAsync(id, input.Reason));

    /// <summary>Pelanggan bayar hutang → resit + Duit Masuk. Batal bayaran guna POST /api/receipts/{id}/void.</summary>
    [HttpPost("payments")]
    public Task<ActionResult<ReceiptDto>> Pay(CreditPaymentInput input) =>
        Run(async () => await sales.GetReceiptAsync(await book.CreatePaymentAsync(input)));
}
