using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Calendar;

// Reminders before calendar events (run every few minutes by CalendarReminderBackgroundService). For each event with
// a reminder, each occurrence whose reminder moment (start time — 08:00 for an all-day event — minus ReminderMinutes)
// has come and whose start has not passed gets ONE notification (bell + push) to everyone in its audience. The
// calendar_reminders_sent row (unique per event + date) is written BEFORE notifying, so a crash can't send twice.
public static class CalendarReminders
{
    private static readonly TimeOnly AllDayAt = new(8, 0);

    public static async Task<int> RunAsync(IApplicationDbContext context, INotificationService notifications, CancellationToken ct)
    {
        var now = LebanonClock.Now;
        var today = DateOnly.FromDateTime(now);
        var from = today.AddDays(-1);
        var to = today.AddDays(15); // reminders are at most 14 days ahead
        var events = await context.CalendarEvents
            .Where(e => e.ReminderMinutes != null && e.StartDate <= to
                        && (e.Recurrence != CalendarRecurrences.None || (e.EndDate ?? e.StartDate) >= from)
                        && (e.RecurrenceUntil == null || e.RecurrenceUntil >= from))
            .ToListAsync(ct);
        if (events.Count == 0) return 0;

        var ids = events.Select(e => e.Id).ToList();
        var sent = (await context.CalendarRemindersSent.Where(s => ids.Contains(s.CalendarEventId) && s.OccurrenceDate >= from)
                .Select(s => new { s.CalendarEventId, s.OccurrenceDate }).ToListAsync(ct))
            .Select(s => (s.CalendarEventId, s.OccurrenceDate)).ToHashSet();

        var count = 0;
        foreach (var e in events)
        foreach (var d in CalendarRecurrence.Occurrences(e, from, to))
        {
            var start = d.ToDateTime(e.StartTime ?? AllDayAt);
            if (now < start.AddMinutes(-e.ReminderMinutes!.Value) || now >= start || sent.Contains((e.Id, d))) continue;

            context.CalendarRemindersSent.Add(new CalendarReminderSent { CalendarEventId = e.Id, OccurrenceDate = d, SentAt = DateTime.UtcNow });
            try { await context.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return count; } // sent by another run meanwhile: stop, the next run starts clean

            var recipients = await RecipientsAsync(context, e, ct);
            var when = d == today ? "aujourd'hui" : d == today.AddDays(1) ? "demain" : $"le {FrenchDate.DayMonth(d)}";
            var body = e.StartTime is TimeOnly t ? $"{when} à {t:HH'h'mm}" : when;
            if (!string.IsNullOrWhiteSpace(e.Location)) body += $" · {e.Location}";
            await notifications.NotifyMembersAsync(recipients, NotificationTypes.Calendar, $"Rappel : {e.Title}",
                char.ToUpper(body[0]) + body[1..], "/calendrier", ct);
            count++;
        }
        return count;
    }

    // Members in the event's audience (active posts only).
    public static async Task<List<Guid>> RecipientsAsync(IApplicationDbContext context, CalendarEvent e, CancellationToken ct)
    {
        var active = context.MemberAssignments.Where(a => a.EndDate == null && !a.Member.IsDeleted);
        active = e.Audience switch
        {
            CalendarAudiences.Branch => active.Where(a => a.Unit.UnitTypeId == e.UnitTypeId),
            CalendarAudiences.Unit => active.Where(a => a.UnitId == e.UnitId),
            CalendarAudiences.Maitrise => active.Where(a => a.FunctionalRole.IsMaitrise),
            CalendarAudiences.CgTeam => active.Where(a => a.FunctionalRole.SecurityProfile.IsGroupLevel),
            _ => active,
        };
        return await active.Select(a => a.MemberId).Distinct().ToListAsync(ct);
    }
}
