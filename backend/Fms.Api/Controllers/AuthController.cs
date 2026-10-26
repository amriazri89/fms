using Fms.Api.Data;
using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Fms.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, TokenService tokens, CurrentUser current, AuditService audit) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest req)
    {
        var username = req.Username.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user is null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized(new { message = "Nama pengguna atau kata laluan salah." });

        var (token, expires) = tokens.Create(user);
        return new LoginResponse(token, expires, ToDto(user));
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> Me()
    {
        var user = await db.Users.FindAsync(current.Id);
        if (user is null || !user.IsActive) return Unauthorized();
        return ToDto(user);
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        var user = await db.Users.FindAsync(current.Id);
        if (user is null) return Unauthorized();
        if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
            return BadRequest(new { message = "Kata laluan semasa salah." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        audit.Log(AuditActions.ResetPassword, "User", user.Id, newValue: new { self = true });
        await db.SaveChangesAsync();
        return NoContent();
    }

    internal static UserDto ToDto(Domain.User u) => new(u.Id, u.Username, u.FullName, u.Role, u.IsActive);
}
