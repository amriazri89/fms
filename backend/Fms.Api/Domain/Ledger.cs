namespace Fms.Api.Domain;

/// <summary>
/// Satu-satunya tempat yang menentukan bagaimana setiap jenis rekod memberi kesan
/// kepada baki akaun dan kepada untung/rugi. Semua laporan mesti guna kelas ini.
/// </summary>
public static class Ledger
{
    public static IEnumerable<(int AccountId, decimal Delta)> AccountEffects(Transaction t)
    {
        switch (t.Type)
        {
            case TransactionType.Income:
            case TransactionType.OwnerCapital:
            case TransactionType.LoanIn:
                yield return (t.AccountId, t.Amount);
                break;

            case TransactionType.Expense:
            case TransactionType.OwnerWithdrawal:
            case TransactionType.LoanRepayment:
                yield return (t.AccountId, -t.Amount);
                break;

            case TransactionType.Transfer:
            case TransactionType.InternalLoan:
                if (t.ToAccountId is int to && to != t.AccountId)
                {
                    yield return (t.AccountId, -t.Amount);
                    yield return (to, t.Amount);
                }
                break;
        }
    }

    /// <summary>Label Tunai / Bank untuk rekod yang dijana dari kaedah bayaran (resit, gaji, bil, hutang, tuntutan).</summary>
    public static MoneyChannel ChannelFor(PaymentMethod method) =>
        method == PaymentMethod.Cash ? MoneyChannel.Cash : MoneyChannel.Bank;

    public static bool CountsAsProfit(TransactionType type) =>
        type is TransactionType.Income or TransactionType.Expense;

    /// <summary>Jenis yang hanya dijana oleh modul Hutang, tidak boleh direkod / diubah terus.</summary>
    public static IReadOnlySet<TransactionType> SystemOnlyTypes { get; } =
        new HashSet<TransactionType> { TransactionType.LoanIn, TransactionType.LoanRepayment };
}
