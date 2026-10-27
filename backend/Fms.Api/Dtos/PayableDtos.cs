using System.ComponentModel.DataAnnotations;
using Fms.Api.Domain;

namespace Fms.Api.Dtos;

// ---------- Pembekal ----------
public record SupplierInput(
    [Required, MaxLength(150)] string Name,
    [MaxLength(100)] string? ContactPerson,
    [MaxLength(50)] string? Phone,
    [MaxLength(100)] string? Email,
    [MaxLength(300)] string? Address,
    [MaxLength(50)] string? Tag,
    [MaxLength(1000)] string? Notes,
    bool IsActive = true);

public record SupplierDto(int Id, string Name, string? ContactPerson, string? Phone, string? Email, string? Address,
    string? Tag, string? Notes, bool IsActive, DateTime CreatedAt);

public record SupplierListItem(int Id, string Name, string? ContactPerson, string? Phone, string? Tag, bool IsActive,
    decimal Outstanding, int OpenCount, int OverdueCount, DateOnly? NextDueDate);

public record SupplierDetailDto(SupplierDto Supplier, decimal TotalAmount, decimal TotalPaid, decimal Outstanding,
    IReadOnlyList<PayableListItem> Payables, IReadOnlyList<PayablePaymentDto> Payments);

// ---------- Hutang ----------
public record PayableQuery(string? Q, int? SupplierId, int? BusinessUnitId, PayableKind? Kind, string? Status,
    int Page = 1, int PageSize = 30);

public record PayableInput(
    PayableKind Kind,
    int SupplierId,
    int BusinessUnitId,
    int? CategoryId,
    DateOnly Date,
    DateOnly DueDate,
    [Required, MaxLength(300)] string Description,
    [MaxLength(50)] string? SupplierReference,
    decimal Amount,
    decimal? InstallmentAmount,
    [MaxLength(1000)] string? Notes,
    // Pinjaman sahaja: akaun yang menerima duit pinjaman. Kosong = duit diterima sebelum guna sistem.
    int? ReceivedAccountId,
    // Pinjaman sahaja: duit masuk sebagai Tunai atau Bank
    MoneyChannel? ReceivedChannel = null);

public record PayableListItem(int Id, string Number, PayableKind Kind, DateOnly Date, DateOnly DueDate,
    int SupplierId, string SupplierName, int BusinessUnitId, string BusinessUnitName,
    string Description, string? SupplierReference, decimal Amount, decimal AmountPaid, decimal Balance,
    PayableStatus Status, bool IsOverdue, int DaysToDue);

public record PayableDto(
    int Id, string Number, PayableKind Kind, DateOnly Date, DateOnly DueDate,
    int SupplierId, string SupplierName, string? SupplierPhone,
    int BusinessUnitId, string BusinessUnitName, int? CategoryId, string? CategoryName,
    string Description, string? SupplierReference, decimal Amount, decimal AmountPaid, decimal Balance,
    decimal? InstallmentAmount, decimal InterestPaid, PayableStatus Status, bool IsOverdue, int DaysToDue,
    string? Notes, string? CancelReason, int? ReceivedTransactionId, int? ReceivedAccountId, string? ReceivedAccountName,
    MoneyChannel? ReceivedChannel,
    IReadOnlyList<PayablePaymentDto> Payments, string CreatedBy, DateTime CreatedAt, DateTime? UpdatedAt);

public record PayablePaymentInput(
    DateOnly Date,
    decimal Amount,
    decimal InterestAmount,
    int? InterestCategoryId,
    int AccountId,
    PaymentMethod Method,
    [MaxLength(50)] string? Reference,
    [MaxLength(300)] string? Notes);

public record PayablePaymentDto(int Id, string Number, int PayableId, string PayableNumber, string SupplierName,
    DateOnly Date, decimal Amount, decimal InterestAmount, string AccountName, PaymentMethod Method,
    string? Reference, string? Notes, bool IsVoided, string? VoidReason, string CreatedBy, DateTime CreatedAt);

// ---------- Ringkasan ----------
public record PayablesSummaryDto(decimal Total, decimal Overdue, int Count, decimal DueNext30Days,
    IReadOnlyList<PayableListItem> Upcoming);

/// <summary>Baucar bayaran untuk dicetak.</summary>
public record PaymentVoucherDto(PayablePaymentDto Payment, PayableKind Kind, string PayableDescription,
    string? SupplierReference, string? SupplierPhone, string? SupplierAddress,
    decimal PayableAmount, decimal BalanceAfter, SellerDto Seller);
