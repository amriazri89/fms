using System.ComponentModel.DataAnnotations;
using Fms.Api.Domain;

namespace Fms.Api.Dtos;

public record ListResult<T>(IReadOnlyList<T> Items, int Count, decimal Total);

// ---------- Pekerja ----------
public record EmployeeInput(
    [Required, MaxLength(150)] string Name,
    [MaxLength(20)] string? IcNo,
    [MaxLength(50)] string? Phone,
    [MaxLength(100)] string? Position,
    int? BusinessUnitId,
    EmploymentType EmploymentType,
    decimal BasicRate,
    DateOnly? JoinDate,
    [MaxLength(50)] string? BankName,
    [MaxLength(30)] string? BankAccountNo,
    [MaxLength(1000)] string? Notes,
    bool IsActive = true);

public record EmployeeDto(int Id, string Name, string? IcNo, string? Phone, string? Position, int? BusinessUnitId, string? BusinessUnitName,
    EmploymentType EmploymentType, decimal BasicRate, DateOnly? JoinDate, string? BankName, string? BankAccountNo, string? Notes,
    bool IsActive, string? LastPaidPeriod, decimal PaidThisYear);

// ---------- Gaji ----------
public record WageQuery(int? EmployeeId, string? Month, int? Year, bool IncludeVoided = false);

public record WageInput(
    int EmployeeId,
    [Required] string PeriodMonth,
    decimal? DaysWorked,
    decimal BasicPay,
    decimal Allowance,
    decimal Overtime,
    decimal Deduction,
    DateOnly PayDate,
    int BusinessUnitId,
    int AccountId,
    int CategoryId,
    PaymentMethod Method,
    [MaxLength(500)] string? Notes);

public record WageDto(int Id, string Number, int EmployeeId, string EmployeeName, string? Position, string? IcNo, string? BankName,
    string? BankAccountNo, EmploymentType EmploymentType, string PeriodMonth, decimal? DaysWorked, decimal BasicPay, decimal Allowance,
    decimal Overtime, decimal Deduction, decimal NetPay, DateOnly PayDate, int BusinessUnitId, string BusinessUnitName, string AccountName,
    string CategoryName, PaymentMethod Method, string? Notes, bool IsVoided, string? VoidReason, string CreatedBy, DateTime CreatedAt,
    SellerDto Seller);

// ---------- Bil utiliti ----------
public record UtilityQuery(UtilityType? Type, string? Status, int? BusinessUnitId, DateOnly? From, DateOnly? To);

public record UtilityPayInput(DateOnly PaidDate, int AccountId, PaymentMethod Method, [MaxLength(50)] string? Reference);

public record UtilityInput(
    UtilityType Type,
    [MaxLength(100)] string? Provider,
    [MaxLength(50)] string? AccountNo,
    int BusinessUnitId,
    int CategoryId,
    DateOnly BillDate,
    DateOnly DueDate,
    [Required] string PeriodMonth,
    decimal Amount,
    [MaxLength(500)] string? Notes,
    // Isi untuk bil yang sudah dibayar semasa direkod
    UtilityPayInput? PayNow);

public record UtilityDto(int Id, string Number, UtilityType Type, string? Provider, string? AccountNo, int BusinessUnitId, string BusinessUnitName,
    int CategoryId, string CategoryName, DateOnly BillDate, DateOnly DueDate, string PeriodMonth, decimal Amount, UtilityBillStatus Status,
    bool IsOverdue, DateOnly? PaidDate, int? PaidAccountId, string? PaidAccountName, PaymentMethod? Method, string? Reference, string? Notes,
    string CreatedBy, DateTime CreatedAt);

// ---------- Tuntutan ----------
public record ClaimQuery(string? Status, DateOnly? From, DateOnly? To);

public record ClaimInput(
    int? EmployeeId,
    DateOnly ClaimDate,
    int BusinessUnitId,
    int CategoryId,
    [Required, MaxLength(300)] string Description,
    decimal Amount);

public record ClaimReviewInput(bool Approve, [MaxLength(300)] string? Remark);

public record ClaimPayInput(DateOnly PaidDate, int AccountId, PaymentMethod Method);

public record ClaimDto(int Id, string Number, int RequestedById, string RequestedBy, int? EmployeeId, string ClaimantName,
    DateOnly ClaimDate, int BusinessUnitId, string BusinessUnitName, int CategoryId, string CategoryName, string Description, decimal Amount,
    bool HasReceipt, string? ReceiptOriginalName, ClaimStatus Status, string? ReviewedBy, DateTime? ReviewedAt, string? ReviewRemark,
    DateOnly? PaidDate, string? PaidAccountName, PaymentMethod? Method, DateTime CreatedAt);

// ---------- Penyata Untung Rugi & Laporan Jualan ----------
public record StatementLine(string Name, decimal Amount);
public record StatementSection(string Title, IReadOnlyList<StatementLine> Lines, decimal Total);
public record StatementMonth(string Month, string Label, decimal Revenue, decimal Expenses, decimal Net);
public record StatementBusiness(int BusinessUnitId, string Name, decimal Revenue, decimal Expenses, decimal Net);

public record ProfitLossDto(DateOnly From, DateOnly To, int? BusinessUnitId, string Scope, StatementSection Revenue,
    StatementSection Expenses, decimal NetProfit, decimal? NetMarginPercent, IReadOnlyList<StatementBusiness> ByBusiness,
    IReadOnlyList<StatementMonth> Monthly, StatementSection NotCounted, string CompanyName, DateTime GeneratedAt);

public record SalesReportRow(string Key, string Label, int Count, decimal Total);
public record SalesReportDto(DateOnly From, DateOnly To, int? BusinessUnitId, string Scope, string GroupBy, int Count, decimal Total,
    decimal AveragePerDay, IReadOnlyList<SalesReportRow> Rows, IReadOnlyList<SalesReportRow> ByCategory,
    IReadOnlyList<SalesReportRow> ByBusiness, IReadOnlyList<SalesReportRow> ByAccount, decimal InvoicedInPeriod,
    decimal OutstandingInvoices, string CompanyName);

public record StaffSummaryDto(int PendingClaims, decimal PendingClaimsTotal, int ApprovedUnpaidClaims, decimal ApprovedUnpaidTotal,
    int UnpaidUtilities, decimal UnpaidUtilitiesTotal, int OverdueUtilities, int ActiveEmployees, int EmployeesNotPaidThisMonth,
    IReadOnlyList<ClaimDto> RecentPendingClaims);
