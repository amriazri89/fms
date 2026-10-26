using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Fms.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Policy = Policies.Manager)]
public class UsersController(AppDbContext db, AuditService audit, CurrentUser current) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<UserDto>> List() =>
        (await db.Users.AsNoTracking().OrderBy(u => u.Role).ThenBy(u => u.FullName).ToListAsync()).Select(AuthController.ToDto);

    [HttpPost]
    public async Task<ActionResult<UserDto>> Create(CreateUserRequest req)
    {
        var username = req.Username.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Username == username))
            return Conflict(new { message = "Nama pengguna sudah digunakan." });

        var user = new User
        {
            Username = username,
            FullName = req.FullName.Trim(),
            Role = req.Role,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        audit.Log(AuditActions.Create, "User", user.Id, newValue: new { user.Username, user.FullName, user.Role });
        await db.SaveChangesAsync();
        return AuthController.ToDto(user);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<UserDto>> Update(int id, UpdateUserRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        var removingManager = user.Role == UserRole.Manager && (req.Role != UserRole.Manager || !req.IsActive);
        if (removingManager && !await db.Users.AnyAsync(u => u.Id != id && u.Role == UserRole.Manager && u.IsActive))
            return BadRequest(new { message = "Mesti ada sekurang-kurangnya seorang pengurus aktif." });
        if (id == current.Id && !req.IsActive)
            return BadRequest(new { message = "Anda tidak boleh nyahaktifkan akaun sendiri." });

        var old = new { user.FullName, user.Role, user.IsActive };
        user.FullName = req.FullName.Trim();
        user.Role = req.Role;
        user.IsActive = req.IsActive;
        audit.Log(AuditActions.Update, "User", user.Id, old, new { user.FullName, user.Role, user.IsActive });
        await db.SaveChangesAsync();
        return AuthController.ToDto(user);
    }

    [HttpPost("{id:int}/reset-password")]
    public async Task<IActionResult> ResetPassword(int id, ResetPasswordRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        audit.Log(AuditActions.ResetPassword, "User", user.Id);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
