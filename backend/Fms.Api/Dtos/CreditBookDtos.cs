using System.ComponentModel.DataAnnotations;
using Fms.Api.Domain;

namespace Fms.Api.Dtos;

// ---------- Buku hutang kedai (555) ----------

public record CreditBookQuery(string? Q, int? BusinessUnitId, int? CustomerId, bool IncludeSettled = false);

/// <summary>Satu baris dalam buku hutang: seorang pelanggan dalam satu perniagaan.</summary>
public record CreditBookRow(
    int CustomerId, string CustomerName, string? Phone,
    int BusinessUnitId, string BusinessUnitName,
    decimal TotalTaken, decimal TotalPaid, decimal Balance,
    DateOnly? LastTakenDate, DateOnly? LastPaidDate,
    // Tarikh barang tertua yang belum dibayar (kiraan FIFO) — "hutang sejak"
    DateOnly? OldestUnpaidDate);

public record CreditBookSummaryDto(decimal TotalBalance, int CustomersOwing, IReadOnlyList<CreditBookRow> Rows);

/// <summary>Kind: "Taken" (ambil barang) atau "Paid" (bayaran / resit).</summary>
public record CreditLedgerLineDto(
    string Kind, int Id, DateOnly Date, string Description, decimal Amount,
    // Baki selepas baris ini. Null untuk baris yang dibatalkan.
    decimal? Balance,
    bool IsVoided, string? VoidReason, string? ReceiptNumber, PaymentMethod? Method,
    string CreatedBy, DateTime CreatedAt);

public record CreditLedgerDto(
    int CustomerId, string CustomerName, string? Phone, string? ContactPerson,
    int BusinessUnitId, string BusinessUnitName,
    decimal TotalTaken, decimal TotalPaid, decimal Balance,
    DateOnly? OldestUnpaidDate,
    IReadOnlyList<CreditLedgerLineDto> Lines);

public record CreditSaleInput(
    int CustomerId, int BusinessUnitId, DateOnly Date,
    [Required, MaxLength(300)] string Description,
    decimal Amount);

public record CreditPaymentInput(
    int CustomerId, int BusinessUnitId, DateOnly Date,
    int AccountId, int CategoryId, PaymentMethod Method, decimal Amount,
    [MaxLength(50)] string? Reference);
