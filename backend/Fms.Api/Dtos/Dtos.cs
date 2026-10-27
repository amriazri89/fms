using System.ComponentModel.DataAnnotations;
using Fms.Api.Domain;

namespace Fms.Api.Dtos;

// ---------- Auth & users ----------
public record LoginRequest([Required] string Username, [Required] string Password);
public record UserDto(int Id, string Username, string FullName, UserRole Role, bool IsActive);
public record LoginResponse(string Token, DateTime ExpiresAt, UserDto User);
public record ChangePasswordRequest([Required] string CurrentPassword, [Required, MinLength(8)] string NewPassword);
public record CreateUserRequest([Required, MaxLength(50)] string Username, [Required, MaxLength(100)] string FullName,
    UserRole Role, [Required, MinLength(8)] string Password);
public record UpdateUserRequest([Required, MaxLength(100)] string FullName, UserRole Role, bool IsActive);
public record ResetPasswordRequest([Required, MinLength(8)] string NewPassword);

// ---------- Master data ----------
public record BusinessUnitDto(int Id, string Name, string? Description, string? Color, int SortOrder, bool IsActive,
    string? LegalName, string? RegistrationNo, string? Address, string? Phone, string? Email, string? PaymentInfo, string? DocumentFooter);
public record BusinessUnitInput([Required, MaxLength(100)] string Name, string? Description, string? Color, int SortOrder, bool IsActive = true,
    [MaxLength(150)] string? LegalName = null, [MaxLength(50)] string? RegistrationNo = null, [MaxLength(300)] string? Address = null,
    [MaxLength(50)] string? Phone = null, [MaxLength(100)] string? Email = null, [MaxLength(300)] string? PaymentInfo = null,
    [MaxLength(300)] string? DocumentFooter = null);

public record AccountDto(int Id, string Name, AccountType Type, decimal OpeningBalance, decimal OpeningCash, decimal OpeningBank,
    int? BusinessUnitId, int SortOrder, bool IsActive);
public record AccountInput([Required, MaxLength(100)] string Name, AccountType Type, decimal OpeningCash, decimal OpeningBank,
    int? BusinessUnitId, int SortOrder, bool IsActive = true);

public record CategoryDto(int Id, string Name, CategoryType Type, int? BusinessUnitId, int SortOrder, bool IsActive);
public record CategoryInput([Required, MaxLength(100)] string Name, CategoryType Type, int? BusinessUnitId, int SortOrder, bool IsActive = true);

public record FamilyMemberDto(int Id, string Name, string? Relationship, bool IsActive);
public record FamilyMemberInput([Required, MaxLength(100)] string Name, string? Relationship, bool IsActive = true);

// ---------- Transactions ----------
public record TransactionInput(
    DateOnly Date,
    TransactionType Type,
    decimal Amount,
    int? BusinessUnitId,
    int? ToBusinessUnitId,
    int AccountId,
    int? ToAccountId,
    int? CategoryId,
    int? FamilyMemberId,
    [MaxLength(150)] string? Party,
    [MaxLength(50)] string? Reference,
    [MaxLength(500)] string? Description,
    MoneyChannel? Channel = null,
    MoneyChannel? ToChannel = null);

public record TransactionDto(
    int Id, DateOnly Date, TransactionType Type, decimal Amount,
    int? BusinessUnitId, string? BusinessUnitName,
    int? ToBusinessUnitId, string? ToBusinessUnitName,
    int AccountId, string AccountName,
    int? ToAccountId, string? ToAccountName,
    int? CategoryId, string? CategoryName,
    MoneyChannel? Channel, MoneyChannel? ToChannel,
    int? FamilyMemberId, string? FamilyMemberName,
    string? Party, string? Reference, string? Description,
    string CreatedBy, DateTime CreatedAt, DateTime? UpdatedAt);

public record TransactionQuery(
    DateOnly? From, DateOnly? To, TransactionType? Type, int? BusinessUnitId, int? AccountId,
    int? CategoryId, MoneyChannel? Channel, string? Q, int Page = 1, int PageSize = 50);

public record PagedTransactions(IReadOnlyList<TransactionDto> Items, int Total, int Page, int PageSize,
    decimal TotalIncome, decimal TotalExpense);

// ---------- Dashboard & reports ----------
public record PeriodDto(DateOnly From, DateOnly To);
public record TotalsDto(decimal Income, decimal Expense, decimal Profit, decimal Withdrawals, decimal Capital, decimal TotalMoney,
    decimal TotalCash, decimal TotalBank, decimal TotalUnlabelled);
public record BusinessProfitDto(int BusinessUnitId, string Name, string? Color, decimal Income, decimal Expense, decimal Profit, decimal Withdrawals);
/// <summary>Balance = Cash + Bank + Unlabelled (rekod lama tanpa label Tunai/Bank).</summary>
public record AccountBalanceDto(int Id, string Name, AccountType Type, decimal Balance, bool IsLow,
    decimal Cash, decimal Bank, decimal Unlabelled, int? BusinessUnitId);
public record NamedAmountDto(string Name, decimal Amount);
public record MonthlyPointDto(string Month, decimal Income, decimal Expense, decimal Profit);
public record InternalLoanDto(int LenderId, string Lender, int BorrowerId, string Borrower, decimal Outstanding);

public record DashboardDto(
    PeriodDto Period,
    TotalsDto Totals,
    IReadOnlyList<BusinessProfitDto> Businesses,
    IReadOnlyList<AccountBalanceDto> Accounts,
    IReadOnlyList<NamedAmountDto> ExpenseByCategory,
    IReadOnlyList<MonthlyPointDto> Trend,
    IReadOnlyList<InternalLoanDto> InternalLoans,
    IReadOnlyList<NamedAmountDto> WithdrawalsByMember,
    IReadOnlyList<TransactionDto> Recent,
    ReceivablesDto Receivables,
    PayablesSummaryDto Payables);

public record CashflowLineDto(TransactionType Type, decimal Amount);
public record CashflowReportDto(PeriodDto Period, string Scope, decimal OpeningBalance,
    IReadOnlyList<CashflowLineDto> MoneyIn, IReadOnlyList<CashflowLineDto> MoneyOut,
    decimal TotalIn, decimal TotalOut, decimal NetCashflow, decimal ClosingBalance);

public record ProfitReportDto(PeriodDto Period, IReadOnlyList<BusinessProfitDto> Rows, decimal TotalIncome, decimal TotalExpense, decimal TotalProfit);
public record CategoryReportDto(PeriodDto Period, CategoryType Type, IReadOnlyList<NamedAmountDto> Rows, decimal Total);
public record MonthlyReportDto(int Year, IReadOnlyList<MonthlyPointDto> Months, decimal TotalIncome, decimal TotalExpense, decimal TotalProfit);

public record AuditLogDto(long Id, DateTime Timestamp, string Username, string Action, string Entity, string EntityId, string? OldValue, string? NewValue);
