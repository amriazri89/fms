namespace Fms.Api.Domain;

public enum FieldRule
{
    Hidden,
    Optional,
    Required
}

/// <summary>
/// Medan yang diperlukan untuk setiap jenis rekod.
/// Frontend menyalin peraturan yang sama dalam src/config/transactionTypes.ts —
/// jika ubah di sini, ubah di sana juga.
/// </summary>
public record TransactionRule(FieldRule Business, FieldRule ToBusiness, FieldRule ToAccount, FieldRule Category, FieldRule FamilyMember, FieldRule Channel);

public static class TransactionRules
{
    private static readonly Dictionary<TransactionType, TransactionRule> Rules = new()
    {
        //                                      Business            ToBusiness          ToAccount           Category            FamilyMember        Channel (Tunai/Bank)
        [TransactionType.Income]          = new(FieldRule.Required, FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Required, FieldRule.Hidden,   FieldRule.Required),
        [TransactionType.Expense]         = new(FieldRule.Required, FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Required, FieldRule.Hidden,   FieldRule.Required),
        [TransactionType.Transfer]        = new(FieldRule.Optional, FieldRule.Hidden,   FieldRule.Required, FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden),
        [TransactionType.OwnerWithdrawal] = new(FieldRule.Required, FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Required, FieldRule.Optional),
        [TransactionType.OwnerCapital]    = new(FieldRule.Required, FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Required, FieldRule.Optional),
        [TransactionType.InternalLoan]    = new(FieldRule.Required, FieldRule.Required, FieldRule.Required, FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden),
        [TransactionType.LoanIn]          = new(FieldRule.Required, FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden),
        [TransactionType.LoanRepayment]   = new(FieldRule.Required, FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden,   FieldRule.Hidden),
    };

    public static TransactionRule For(TransactionType type) =>
        Rules.TryGetValue(type, out var r) ? r : throw new ArgumentOutOfRangeException(nameof(type));
}
