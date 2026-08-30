using GNDJ.Application.Common;

namespace GNDJ.Application.Tests;

// Calendar-date business logic runs in Lebanon local time (UTC+2, UTC+3 in DST), never UTC — a UTC "today"
// flips a few hours late at midnight, which was a real deadline off-by-a-day. We can't assert an exact wall
// clock, but the offset from UTC is bounded, so pin that invariant.
public class LebanonClockTests
{
    [Fact]
    public void Now_is_ahead_of_utc_by_two_or_three_hours()
    {
        var offset = LebanonClock.Now - DateTime.UtcNow;
        // Lebanon is always east of UTC: +2 (standard) or +3 (DST). Allow a small slack for execution time.
        Assert.InRange(offset, TimeSpan.FromMinutes(115), TimeSpan.FromMinutes(185));
    }

    [Fact]
    public void Today_is_the_utc_date_or_one_day_ahead()
    {
        var utcDate = DateOnly.FromDateTime(DateTime.UtcNow);
        var beirut = LebanonClock.Today;
        // Being ahead of UTC, the Beirut date is either the same day or (late UTC evening) the next day.
        Assert.True(beirut == utcDate || beirut == utcDate.AddDays(1),
            $"Beirut date {beirut} should be {utcDate} or the day after.");
    }
}
