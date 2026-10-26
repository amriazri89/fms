using System.Text.Json;
using System.Text.Json.Serialization;
using Fms.Api.Data;
using Fms.Api.Domain;

namespace Fms.Api.Services;

/// <summary>
/// Catat siapa buat apa. Log ditambah ke DbContext yang sama supaya disimpan
/// dalam SaveChanges yang sama dengan perubahan sebenar.
/// </summary>
public class AuditService(AppDbContext db, CurrentUser user)
{
    private static readonly JsonSerializerOptions Json = new()
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public void Log(string action, string entity, object entityId, object? oldValue = null, object? newValue = null)
    {
        db.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id == 0 ? null : user.Id,
            Username = string.IsNullOrEmpty(user.Username) ? "system" : user.Username,
            Action = action,
            Entity = entity,
            EntityId = entityId.ToString() ?? "",
            OldValue = oldValue is null ? null : JsonSerializer.Serialize(oldValue, Json),
            NewValue = newValue is null ? null : JsonSerializer.Serialize(newValue, Json),
        });
    }
}

public static class AuditActions
{
    public const string Create = "Create";
    public const string Update = "Update";
    public const string Delete = "Delete";
    public const string Login = "Login";
    public const string ResetPassword = "ResetPassword";
    public const string Convert = "Convert";
    public const string Cancel = "Cancel";
    public const string Void = "Void";
    public const string Approve = "Approve";
    public const string Reject = "Reject";
}
