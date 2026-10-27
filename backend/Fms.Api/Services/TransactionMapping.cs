using System.Linq.Expressions;
using Fms.Api.Domain;
using Fms.Api.Dtos;

namespace Fms.Api.Services;

public static class TransactionMapping
{
    public static readonly Expression<Func<Transaction, TransactionDto>> ToDto = t => new TransactionDto(
        t.Id, t.Date, t.Type, t.Amount,
        t.BusinessUnitId, t.BusinessUnit != null ? t.BusinessUnit.Name : null,
        t.ToBusinessUnitId, t.ToBusinessUnit != null ? t.ToBusinessUnit.Name : null,
        t.AccountId, t.Account != null ? t.Account.Name : "",
        t.ToAccountId, t.ToAccount != null ? t.ToAccount.Name : null,
        t.CategoryId, t.Category != null ? t.Category.Name : null,
        t.Channel, t.ToChannel,
        t.FamilyMemberId, t.FamilyMember != null ? t.FamilyMember.Name : null,
        t.Party, t.Reference, t.Description,
        t.CreatedBy != null ? t.CreatedBy.FullName : "",
        t.CreatedAt, t.UpdatedAt);

    /// <summary>Gambaran ringkas untuk audit log (tanpa navigation).</summary>
    public static object Snapshot(Transaction t) => new
    {
        t.Date, t.Type, t.Amount, t.BusinessUnitId, t.ToBusinessUnitId, t.AccountId, t.ToAccountId,
        t.CategoryId, t.Channel, t.ToChannel, t.FamilyMemberId, t.Party, t.Reference, t.Description
    };
}
