using System.ComponentModel.DataAnnotations;
using Fms.Api.Domain;

namespace Fms.Api.Dtos;

// ---------- Pemilik sawit ----------

public record PalmOwnerInput(
    [Required, MaxLength(150)] string Name,
    [MaxLength(30)] string? Phone,
    [MaxLength(20)] string? IcNumber,
    [MaxLength(150)] string? BankInfo,
    [MaxLength(300)] string? Notes,
    bool IsActive = true);

/// <summary>Kadar caj daripada tiket terakhir pemilik ini (untuk isi borang tiket baru).</summary>
public record PalmLastChargeDto(int ChargeTypeId, ChargeMethod Method, decimal Rate);

public record PalmOwnerDto(int Id, string Name, string? Phone, string? IcNumber, string? BankInfo, string? Notes, bool IsActive,
    // Duit pemilik ini yang belum dibayar (bayaran kilang yang sudah disahkan)
    decimal Unpaid,
    IReadOnlyList<PalmLastChargeDto> LastCharges);

// ---------- Jenis caj ----------

public record PalmChargeTypeInput(
    [Required, MaxLength(100)] string Name,
    int CategoryId,
    ChargeMethod DefaultMethod,
    decimal DefaultRate,
    int SortOrder,
    bool IsActive = true);

public record PalmChargeTypeDto(int Id, string Name, int CategoryId, string CategoryName, ChargeMethod DefaultMethod, decimal DefaultRate,
    int SortOrder, bool IsActive);

// ---------- Bayaran kilang (batch) ----------

public record PalmChargeInput(int ChargeTypeId, ChargeMethod Method, decimal Rate);

public record PalmTicketInput(
    int OwnerId,
    [MaxLength(50)] string? TicketNo,
    DateOnly Date,
    decimal WeightKg,
    decimal? PricePerTonne,
    decimal Gross,
    IReadOnlyList<PalmChargeInput> Charges);

public record PalmBatchInput(
    [Required, MaxLength(150)] string MillName,
    DateOnly Date,
    decimal AmountReceived,
    int BusinessUnitId,
    int AccountId,
    MoneyChannel Channel,
    [MaxLength(50)] string? Reference,
    [MaxLength(500)] string? Notes,
    IReadOnlyList<PalmTicketInput> Tickets);

public record PalmChargeDto(int ChargeTypeId, string Name, ChargeMethod Method, decimal Rate, decimal Amount);

public record PalmTicketDto(int Id, int OwnerId, string OwnerName, string? TicketNo, DateOnly Date, decimal WeightKg, decimal? PricePerTonne,
    decimal Gross, decimal Net, IReadOnlyList<PalmChargeDto> Charges);

public record PalmPayoutDto(int Id, string Number, int BatchId, string BatchNumber, int OwnerId, string OwnerName, DateOnly Date, decimal Amount,
    int AccountId, string AccountName, PaymentMethod Method, string? Reference, bool IsVoided, string? VoidReason,
    string CreatedBy, DateTime CreatedAt);

/// <summary>Ringkasan seorang pemilik dalam satu bayaran kilang.</summary>
public record PalmOwnerShareDto(int OwnerId, string OwnerName, string? Phone, string? BankInfo, int TicketCount, decimal WeightKg,
    decimal Gross, decimal Charges, decimal Net,
    // Bayaran aktif (jika sudah dibayar)
    PalmPayoutDto? Payout);

public record PalmChargeTotalDto(int ChargeTypeId, string Name, decimal Amount);

public record PalmBatchDto(
    int Id, string Number, string MillName, DateOnly Date, decimal AmountReceived,
    int BusinessUnitId, string BusinessUnitName, int AccountId, string AccountName, MoneyChannel Channel,
    string? Reference, string? Notes, PalmBatchStatus Status, string? CancelReason,
    decimal TotalGross, decimal TotalCharges, decimal TotalNet, decimal TotalWeightKg,
    // Amaun diterima − jumlah kasar tiket. Mesti 0 sebelum disahkan.
    decimal Difference,
    decimal PaidToOwners, decimal UnpaidToOwners,
    IReadOnlyList<PalmChargeTotalDto> ChargeTotals,
    IReadOnlyList<PalmTicketDto> Tickets,
    IReadOnlyList<PalmOwnerShareDto> Owners,
    string CreatedBy, DateTime CreatedAt);

public record PalmBatchListItem(int Id, string Number, string MillName, DateOnly Date, decimal AmountReceived, string BusinessUnitName,
    PalmBatchStatus Status, int TicketCount, int OwnerCount, int OwnersPaid, decimal TotalCharges, decimal UnpaidToOwners);

public record PalmBatchQuery(DateOnly? From, DateOnly? To, string? Status, int? OwnerId);

public record PalmSummaryDto(
    // Semua duit pemilik yang dipegang dan belum dibayar (bayaran kilang disahkan)
    decimal UnpaidToOwners,
    int OwnersWaiting,
    IReadOnlyList<PalmBatchListItem> Batches);

public record PalmPayoutInput(
    int BatchId,
    int OwnerId,
    DateOnly Date,
    int AccountId,
    PaymentMethod Method,
    [MaxLength(50)] string? Reference);
