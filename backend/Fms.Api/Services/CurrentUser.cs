using System.Security.Claims;
using Fms.Api.Domain;

namespace Fms.Api.Services;

public class CurrentUser(IHttpContextAccessor accessor)
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public int Id => int.TryParse(Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;

    public string Username => Principal?.FindFirstValue(ClaimTypes.Name) ?? "";

    public UserRole Role => Enum.TryParse<UserRole>(Principal?.FindFirstValue(ClaimTypes.Role), out var r) ? r : UserRole.Clerk;

    public bool IsManager => Role == UserRole.Manager;
    public bool IsClerk => Role == UserRole.Clerk;
}
