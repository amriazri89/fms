using System.ComponentModel.DataAnnotations;
using Fms.Api.Domain;

namespace Fms.Api.Dtos;

// ---------- Umum ----------
public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize, decimal SumTotal, decimal SumOutstanding);

public record SalesQuery(string? Q, int? CustomerId, int? BusinessUnitId, string? Status, DateOnly? From, DateOnly? To, int Page = 1, int PageSize = 30);

public record DocumentSettingsDto(string TaxLabel, decimal DefaultTaxRate, int QuotationValidDays, int PaymentTermDays,
    string? DefaultQuotationTerms, string? DefaultInvoiceTerms, string ReceiptPrefix,
    string PayablePrefix, string PaymentVoucherPrefix, string PayslipPrefix, string UtilityBillPrefix, string ClaimPrefix, string CompanyName);

public record ReasonInput([Required, MaxLength(300)] string Reason);

/// <summary>Penjual (perniagaan) seperti dicetak pada dokumen.</summary>
public record SellerDto(int BusinessUnitId, string Name, string? RegistrationNo, string? Address, string? Phone, string? Email,
    string? PaymentInfo, string? Footer, string? Color);

/// <summary>Pembeli seperti dicetak pada dokumen.</summary>
public record BuyerDto(int? CustomerId, string Name, string? ContactPerson, string? Phone, string? Email, string? Address, string? RegistrationNo);

// ---------- Pelanggan ----------
public record CustomerInput(
    [Required, MaxLength(150)] string Name,
    [MaxLength(100)] string? ContactPerson,
    [MaxLength(50)] string? Phone,
    [MaxLength(100)] string? Email,
    [MaxLength(300)] string? Address,
    [MaxLength(50)] string? RegistrationNo,
    [MaxLength(50)] string? Tag,
    [MaxLength(1000)] string? Notes,
    bool IsActive = true);

public record CustomerDto(int Id, string Name, string? ContactPerson, string? Phone, string? Email, string? Address,
    string? RegistrationNo, string? Tag, string? Notes, bool IsActive, DateTime CreatedAt);

public record CustomerListItem(int Id, string Name, string? ContactPerson, string? Phone, string? Tag, bool IsActive,
    decimal TotalInvoiced, decimal TotalPaid, decimal Outstanding, int OverdueInvoices, int OpenQuotations, DateOnly? LastActivity,
    decimal CreditBalance);

public record CustomerActivityInput(DateOnly Date, CustomerActivityType Type, [Required, MaxLength(1000)] string Note, DateOnly? FollowUpDate);

public record CustomerActivityDto(int Id, int CustomerId, string CustomerName, DateOnly Date, CustomerActivityType Type, string Note,
    DateOnly? FollowUpDate, bool FollowUpDone, string CreatedBy, DateTime CreatedAt);

public record CustomerDetailDto(CustomerDto Customer, decimal TotalInvoiced, decimal TotalPaid, decimal Outstanding,
    IReadOnlyList<CustomerActivityDto> Activities, IReadOnlyList<QuotationListItem> Quotations,
    IReadOnlyList<InvoiceListItem> Invoices, IReadOnlyList<PaymentListItem> Payments);

// ---------- Dokumen (sebut harga & invois) ----------
public record DocumentLineInput([Required, MaxLength(300)] string Description, decimal Quantity, [MaxLength(20)] string? Unit, decimal UnitPrice);

public record DocumentLineDto(int Id, int SortOrder, string Description, decimal Quantity, string? Unit, decimal UnitPrice, decimal Amount);

public interface IDocumentInput
{
    int BusinessUnitId { get; }
    int CustomerId { get; }
    DateOnly Date { get; }
    string? Subject { get; }
    string? Notes { get; }
    string? Terms { get; }
    decimal DiscountAmount { get; }
    decimal TaxRate { get; }
    List<DocumentLineInput> Items { get; }
}

public record QuotationInput(
    int BusinessUnitId, int CustomerId, DateOnly Date, DateOnly ValidUntil,
    [MaxLength(200)] string? Subject, [MaxLength(2000)] string? Notes, [MaxLength(2000)] string? Terms,
    decimal DiscountAmount, decimal TaxRate, List<DocumentLineInput> Items) : IDocumentInput;

/// <summary>Jika diisi semasa cipta invois, bayaran penuh terus direkod (jualan tunai).</summary>
public record PayNowInput(int AccountId, int CategoryId, PaymentMethod Method, [MaxLength(50)] string? Reference);

public record InvoiceInput(
    int BusinessUnitId, int CustomerId, DateOnly Date, DateOnly DueDate,
    [MaxLength(200)] string? Subject, [MaxLength(2000)] string? Notes, [MaxLength(2000)] string? Terms,
    decimal DiscountAmount, decimal TaxRate, List<DocumentLineInput> Items, PayNowInput? PayNow = null) : IDocumentInput;

public record QuotationStatusInput(QuotationStatus Status);

public record QuotationListItem(int Id, string Number, DateOnly Date, DateOnly ValidUntil, int CustomerId, string CustomerName,
    int BusinessUnitId, string BusinessUnitName, string? Subject, decimal Total, QuotationStatus Status, bool IsExpired, int? InvoiceId);

public record QuotationDto(
    int Id, string Number, DateOnly Date, DateOnly ValidUntil, QuotationStatus Status, bool IsExpired,
    int BusinessUnitId, int CustomerId, string? Subject, string? Notes, string? Terms,
    decimal Subtotal, decimal DiscountAmount, decimal TaxRate, decimal TaxAmount, decimal Total,
    int? InvoiceId, string? InvoiceNumber,
    IReadOnlyList<DocumentLineDto> Items, SellerDto Seller, BuyerDto Buyer,
    string CreatedBy, DateTime CreatedAt, DateTime? UpdatedAt);

public record InvoiceListItem(int Id, string Number, DateOnly Date, DateOnly DueDate, int CustomerId, string CustomerName,
    int BusinessUnitId, string BusinessUnitName, string? Subject, decimal Total, decimal AmountPaid, decimal Balance,
    InvoiceStatus Status, bool IsOverdue, int? QuotationId);

public record InvoiceDto(
    int Id, string Number, DateOnly Date, DateOnly DueDate, InvoiceStatus Status, bool IsOverdue,
    int BusinessUnitId, int CustomerId, string? Subject, string? Notes, string? Terms,
    decimal Subtotal, decimal DiscountAmount, decimal TaxRate, decimal TaxAmount, decimal Total,
    decimal AmountPaid, decimal Balance, int? QuotationId, string? QuotationNumber, string? CancelReason,
    IReadOnlyList<DocumentLineDto> Items, IReadOnlyList<PaymentListItem> Payments, SellerDto Seller, BuyerDto Buyer,
    string CreatedBy, DateTime CreatedAt, DateTime? UpdatedAt);

// ---------- Resit ----------
public record PaymentInput(
    DateOnly Date, int BusinessUnitId, int? CustomerId, [MaxLength(150)] string? ReceivedFrom, int? InvoiceId,
    int AccountId, int CategoryId, PaymentMethod Method, decimal Amount,
    [MaxLength(50)] string? Reference, [MaxLength(300)] string? Description);

public record PaymentListItem(int Id, string Number, DateOnly Date, decimal Amount, PaymentMethod Method, int? CustomerId,
    string ReceivedFrom, int? InvoiceId, string? InvoiceNumber, string BusinessUnitName, string AccountName, bool IsVoided);

public record ReceiptDto(
    int Id, string Number, DateOnly Date, decimal Amount, PaymentMethod Method,
    int BusinessUnitId, int? CustomerId, string ReceivedFrom,
    int? InvoiceId, string? InvoiceNumber, decimal? InvoiceTotal, decimal? BalanceAfter,
    int AccountId, string AccountName, int CategoryId, string CategoryName,
    string? Reference, string? Description,
    bool IsVoided, string? VoidReason, DateTime? VoidedAt, int? TransactionId,
    IReadOnlyList<DocumentLineDto> Items, SellerDto Seller, BuyerDto Buyer,
    string CreatedBy, DateTime CreatedAt);

// ---------- Ringkasan ----------
public record ReceivableItemDto(int CustomerId, string Name, decimal Outstanding, int OverdueCount);
public record ReceivablesDto(decimal Total, decimal Overdue, int InvoiceCount, IReadOnlyList<ReceivableItemDto> TopCustomers,
    decimal CreditBookTotal, int CreditBookCustomers);
