namespace Fms.Api;

public static class Clock
{
    public static DateOnly Today(string timeZoneId)
    {
        var tz = TimeZoneInfo.TryFindSystemTimeZoneById(timeZoneId, out var found) ? found : TimeZoneInfo.Local;
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
    }
}
