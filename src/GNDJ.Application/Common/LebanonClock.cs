namespace GNDJ.Application.Common;

// The organisation lives in Lebanon, so every "today's calendar date" used for business windows (scout year,
// passage/demande/document deadlines, overdue checks, absence windows, payment/assignment dates, DOB "not in the
// future" validators, …) must be computed in LEBANON local time — NOT UTC. Lebanon is UTC+2 (UTC+3 in DST), so a
// UTC "today" flips a few hours late: at e.g. 01:00 Beirut the date is already tomorrow, while UTC still reads
// yesterday. That off-by-a-day at midnight was a real correctness gap at deadlines. Route ALL calendar-date logic
// through here. (Real instants — audit timestamps, token expiry, outbox scheduling — stay DateTime.UtcNow.)
public static class LebanonClock
{
    // Resolved once. Try the IANA id first (works on .NET's ICU incl. Windows since .NET 6), then the Windows id,
    // then fall back to UTC so the app never fails to start over a missing tz database.
    private static readonly TimeZoneInfo Tz = Resolve();

    private static TimeZoneInfo Resolve()
    {
        foreach (var id in new[] { "Asia/Beirut", "Middle East Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return TimeZoneInfo.Utc;
    }

    // Current wall-clock time in Lebanon.
    public static DateTime Now => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Tz);

    // Today's calendar date in Lebanon — the drop-in replacement for LebanonClock.Today.
    public static DateOnly Today => DateOnly.FromDateTime(Now);
}
