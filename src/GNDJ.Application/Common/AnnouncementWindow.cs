using System.Globalization;

namespace GNDJ.Application.Common;

// Decides whether a dated announcement (e.g. a login-page message) should be visible right now. A message is
// active when today is within [start, end] INCLUSIVE. An empty/invalid start = show immediately; an empty/invalid
// end = show until removed manually. Dates are the settings "yyyy-MM-dd" format, compared in Lebanon local time.
public static class AnnouncementWindow
{
    public static bool IsActive(string? startDate, string? endDate)
    {
        var today = LebanonClock.Today;
        if (DateOnly.TryParseExact(startDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start)
            && today < start) return false;
        if (DateOnly.TryParseExact(endDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var end)
            && today > end) return false;
        return true;
    }
}
