using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Rentree;

// Weekly reminder digest for the rentrée checklist. For each assignee with tasks that are OVERDUE or coming up
// (within the horizon) — and not already effectively done — one email lists exactly those tasks with their
// dates. Cadence is weekly (a marker setting holds the last-send date), so nobody is spammed; the send goes
// through the durable outbox. Driven by RentreeReminderBackgroundService; the same logic is testable here.
public static class RentreeReminders
{
    public const string LastSentKey = "rentree.reminder_last_sent";   // yyyy-MM-dd of the last digest run
    public const string EnabledKey = "rentree.reminders_enabled";     // "true"/"false" master switch
    private const int HorizonDays = 7;   // include tasks due within a week (plus everything already overdue)
    private const int CadenceDays = 7;   // send at most once a week

    // Send the digest if it's due (weekly) and reminders are enabled. Returns the number of emails queued.
    public static async Task<int> RunIfDueAsync(IApplicationDbContext context, IEmailQueue queue, CancellationToken ct)
    {
        var enabled = await context.Settings.Where(s => s.Key == EnabledKey).Select(s => s.Value).FirstOrDefaultAsync(ct);
        if (enabled == "false") return 0; // default (unset) = enabled

        var today = LebanonClock.Today;
        var last = await context.Settings.Where(s => s.Key == LastSentKey).Select(s => s.Value).FirstOrDefaultAsync(ct);
        if (DateOnly.TryParseExact(last, "yyyy-MM-dd", out var lastDate) && today.DayNumber - lastDate.DayNumber < CadenceDays)
            return 0; // sent recently

        var sent = await SendDigestAsync(context, queue, today, ct);

        // Stamp the marker even when 0 were sent, so we don't recompute every 12h all week.
        var marker = await context.Settings.FirstOrDefaultAsync(s => s.Key == LastSentKey, ct);
        if (marker is null)
            context.Settings.Add(new Setting { Key = LastSentKey, Value = today.ToString("yyyy-MM-dd"), Category = "rentree", Label = "Dernier envoi des rappels de rentrée", ValueType = "string" });
        else marker.Value = today.ToString("yyyy-MM-dd");
        await context.SaveChangesAsync(ct);

        return sent;
    }

    // Build + queue one digest per assignee with relevant (overdue or upcoming, not-done) tasks.
    public static async Task<int> SendDigestAsync(IApplicationDbContext context, IEmailQueue queue, DateOnly today, CancellationToken ct)
    {
        // Candidate tasks: not done + carry some deadline (a fixed date or a live anchor).
        var tasks = await context.RentreeTasks
            .Where(t => t.Status != "done" && (t.DueDate != null || t.DeadlineAnchor != null))
            .ToListAsync(ct);
        if (tasks.Count == 0) return 0;

        var dueByTask = await RentreeAnchors.ResolveDueDatesAsync(context, tasks, ct);
        // Skip tasks whose live progress reports complete (auto-satisfied) — computed per year.
        var complete = new HashSet<Guid>();
        foreach (var grp in tasks.GroupBy(t => t.ScoutYear))
        {
            var p = await RentreeProgress.ComputeAsync(context, grp.ToList(), grp.Key, ct);
            foreach (var kv in p) if (kv.Value.Complete) complete.Add(kv.Key);
        }

        var horizon = today.AddDays(HorizonDays);
        var relevant = tasks
            .Where(t => !complete.Contains(t.Id) && dueByTask.GetValueOrDefault(t.Id) is { } d && d <= horizon)
            .ToList();
        if (relevant.Count == 0) return 0;

        // Group the relevant tasks by assignee member.
        var byMember = new Dictionary<Guid, List<(RentreeTask Task, DateOnly Due)>>();
        foreach (var t in relevant)
        {
            var due = dueByTask[t.Id]!.Value;
            foreach (var mid in t.AssigneeMemberIds)
            {
                if (!byMember.TryGetValue(mid, out var l)) { l = []; byMember[mid] = l; }
                l.Add((t, due));
            }
        }
        if (byMember.Count == 0) return 0;

        var memberIds = byMember.Keys.ToList();
        var members = await context.Members.Where(m => memberIds.Contains(m.Id))
            .Select(m => new { m.Id, m.FirstName, m.LastName, m.PrimaryContactEmail }).ToListAsync(ct);
        var resolver = await ContactEmailResolver.LoadAsync(context, memberIds, ct);

        var unitIds = relevant.Where(t => t.UnitId.HasValue).Select(t => t.UnitId!.Value).Distinct().ToList();
        var unitNames = await context.Units.Where(u => unitIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Name }).ToDictionaryAsync(x => x.Id, x => x.Name, ct);

        var baseUrl = ((await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct))
            ?? "http://localhost:5173").TrimEnd('/');
        var rentreeUrl = $"{baseUrl}/rentree";

        var jobs = new List<EmailJob>();
        foreach (var m in members)
        {
            var email = resolver.Resolve(m.Id, m.PrimaryContactEmail);
            if (string.IsNullOrWhiteSpace(email)) continue;

            var mine = byMember[m.Id].OrderBy(x => x.Due).ToList();
            int overdue = mine.Count(x => x.Due < today);
            // Plain-text bulleted list (rendered white-space:pre-line in the template; newlines survive HTML-encoding).
            var lines = mine.Select(x =>
            {
                var unit = x.Task.UnitId is { } u && unitNames.TryGetValue(u, out var un) ? $" ({un})" : "";
                var when = x.Due < today
                    ? $"en retard depuis le {x.Due:dd/MM/yyyy}"
                    : $"à faire pour le {x.Due:dd/MM/yyyy}";
                return $"• {x.Task.Title}{unit} — {when}";
            });
            jobs.Add(new EmailJob("rentree_task_reminder", email!, new Dictionary<string, string>
            {
                ["memberName"] = $"{m.FirstName} {m.LastName}".Trim(),
                ["tasksList"] = string.Join("\n", lines),
                ["overdueCount"] = overdue.ToString(),
                ["taskCount"] = mine.Count.ToString(),
                ["rentreeUrl"] = rentreeUrl,
            }));
        }

        await queue.EnqueueManyAsync(jobs, ct);
        return jobs.Count;
    }
}
