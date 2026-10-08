using System.Globalization;
using System.Text;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Content;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Calendar;

// iCalendar (.ics, RFC 5545) text for the personal phone-calendar link. Each occurrence is its own VEVENT (simpler
// for every phone than RRULE + exceptions). Times are converted from Lebanon time to UTC; all-day items use DATE values.
public static class CalendarIcs
{
    public static string Build(IEnumerable<CalendarItemDto> items)
    {
        var sb = new StringBuilder();
        void Line(string s) => Fold(sb, s);
        Line("BEGIN:VCALENDAR");
        Line("VERSION:2.0");
        Line("PRODID:-//GNDJ//Calendrier//FR");
        Line("CALSCALE:GREGORIAN");
        Line("METHOD:PUBLISH");
        Line("X-WR-CALNAME:GNDJ Scout");
        Line("X-PUBLISHED-TTL:PT6H");
        var stamp = DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        foreach (var i in items)
        {
            Line("BEGIN:VEVENT");
            Line($"UID:{i.Id.Replace(':', '-')}@gndj.org");
            Line($"DTSTAMP:{stamp}");
            if (i.StartTime is TimeOnly st)
            {
                var start = LebanonClock.ToUtc(i.Date, st);
                var end = i.EndTime is TimeOnly et ? LebanonClock.ToUtc(i.EndDate ?? i.Date, et) : start.AddHours(1);
                Line($"DTSTART:{start:yyyyMMdd'T'HHmmss'Z'}");
                Line($"DTEND:{end:yyyyMMdd'T'HHmmss'Z'}");
            }
            else
            {
                Line($"DTSTART;VALUE=DATE:{i.Date:yyyyMMdd}");
                Line($"DTEND;VALUE=DATE:{(i.EndDate ?? i.Date).AddDays(1):yyyyMMdd}");
            }
            Line($"SUMMARY:{Escape(i.Title)}");
            var desc = string.Join("\n", new[] { i.AudienceLabel, i.Description }.Where(s => !string.IsNullOrWhiteSpace(s)));
            if (desc.Length > 0) Line($"DESCRIPTION:{Escape(desc)}");
            if (!string.IsNullOrWhiteSpace(i.Location)) Line($"LOCATION:{Escape(i.Location)}");
            Line("END:VEVENT");
        }
        Line("END:VCALENDAR");
        return sb.ToString();
    }

    private static string Escape(string s) =>
        s.Replace("\\", "\\\\").Replace(";", "\\;").Replace(",", "\\,").Replace("\r\n", "\\n").Replace("\n", "\\n");

    // Content lines are folded at 75 octets (continuation lines start with a space); CRLF line ends.
    private static void Fold(StringBuilder sb, string line)
    {
        var bytes = 0;
        foreach (var ch in line)
        {
            // UTF-8 size of the char without allocating a string: 1 (ASCII), 2, 3, or 4 for a surrogate pair —
            // counted on the high surrogate so a pair is never split across two lines.
            var n = ch < 0x80 ? 1 : ch < 0x800 ? 2 : char.IsHighSurrogate(ch) ? 4 : char.IsLowSurrogate(ch) ? 0 : 3;
            if (n > 0 && bytes + n > 74) { sb.Append("\r\n "); bytes = 1; }
            sb.Append(ch);
            bytes += n;
        }
        sb.Append("\r\n");
    }
}

// « Publier aussi sur le site »: keeps a public agenda Event in step with a calendar event (group / branch / unit,
// not repeating). Turning the option off — or deleting the calendar event — removes the public copy.
public static class CalendarPublish
{
    public static async Task SyncAsync(IApplicationDbContext context, CalendarEvent e, CancellationToken ct)
    {
        var publish = e.PublishOnSite && e.Recurrence == CalendarRecurrences.None
                      && e.Audience is CalendarAudiences.Group or CalendarAudiences.Branch or CalendarAudiences.Unit;
        var existing = e.PublicEventId is Guid pid ? await context.Events.FirstOrDefaultAsync(x => x.Id == pid, ct) : null;

        if (!publish)
        {
            if (existing is not null) context.Events.Remove(existing);
            if (e.PublicEventId is not null) { e.PublicEventId = null; await context.SaveChangesAsync(ct); }
            return;
        }

        if (existing is null)
        {
            var baseSlug = ContentText.Slugify(e.Title);
            var slug = baseSlug;
            for (var i = 2; await context.Events.IgnoreQueryFilters().AnyAsync(x => x.Slug == slug, ct); i++) slug = $"{baseSlug}-{i}";
            existing = new Event { Slug = slug, IsPublished = true, PublishedAt = DateTime.UtcNow };
            context.Events.Add(existing);
        }
        var body = string.IsNullOrWhiteSpace(e.Description) ? ""
            : string.Concat(e.Description.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0)
                .Select(l => $"<p>{System.Net.WebUtility.HtmlEncode(l)}</p>"));
        existing.Title = e.Title;
        existing.BodyHtml = body;
        existing.Summary = ContentText.Excerpt(body);
        existing.StartDate = e.StartDate;
        existing.EndDate = e.EndDate;
        existing.TimeLabel = e.StartTime is TimeOnly st
            ? (e.EndTime is TimeOnly et ? $"{st:HH'h'mm} – {et:HH'h'mm}" : $"{st:HH'h'mm}") : null;
        existing.Location = e.Location;
        existing.TagType = e.Audience switch
        {
            CalendarAudiences.Branch => EventTagTypes.UnitType,
            CalendarAudiences.Unit => EventTagTypes.Unit,
            _ => EventTagTypes.Group,
        };
        existing.TagUnitTypeId = e.Audience == CalendarAudiences.Branch ? e.UnitTypeId : null;
        existing.TagUnitId = e.Audience == CalendarAudiences.Unit ? e.UnitId : null;
        e.PublicEventId = existing.Id;
        await context.SaveChangesAsync(ct);
    }
}
