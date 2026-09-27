using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Passages;

// Reminder to the leaders of every unit that has NOT yet clicked "Terminer le passage de l'unité": an in-app
// notification (bell + push) to all the unit's leaders (CU + assistants), and an email (template
// passage_unit_reminder) to each of them with a reachable contact address.
// Sent by the CG from the passage page ("Relancer les unités non terminées"), and automatically 7 days and
// 2 days before the passage date (PassageReminderBackgroundService, once each, while the passage is open).
public static class PassageReminders
{
    public const string TemplateCode = "passage_unit_reminder";
    // Marker of the automatic reminders already sent, e.g. "2026-2027:7,2" (reset when the scout year changes).
    public const string MarkerKey = "passage.reminders_sent";
    public static readonly int[] AutoDaysBefore = [7, 2];

    public sealed record Result(int Units, int Emails, int Notified);

    // Units with active members that have no PassageUnitSubmission for the year, with how many members still
    // have no passage line.
    public static async Task<List<(Guid UnitId, string Name, int Missing)>> UnfinishedUnitsAsync(
        IApplicationDbContext context, string scoutYear, CancellationToken ct)
    {
        var finished = await context.PassageUnitSubmissions.Where(s => s.ScoutYear == scoutYear).Select(s => s.UnitId).ToListAsync(ct);
        var active = await context.MemberAssignments
            .Where(a => a.EndDate == null && !a.IsDeleted && !a.Member.IsDeleted && !finished.Contains(a.UnitId))
            .Select(a => new { a.UnitId, a.Unit.Name, a.MemberId })
            .Distinct().ToListAsync(ct);
        if (active.Count == 0) return [];
        var withLine = (await context.Passages.Where(p => p.ScoutYear == scoutYear).Select(p => p.MemberId).ToListAsync(ct)).ToHashSet();
        return active.GroupBy(a => (a.UnitId, a.Name))
            .Select(g => (g.Key.UnitId, g.Key.Name, g.Select(x => x.MemberId).Distinct().Count(m => !withLine.Contains(m))))
            .OrderBy(u => u.Name)
            .ToList();
    }

    public static async Task<Result> SendAsync(IApplicationDbContext context, IEmailQueue emailQueue, INotificationService notifications,
        string scoutYear, CancellationToken ct)
    {
        var units = await UnfinishedUnitsAsync(context, scoutYear, ct);
        if (units.Count == 0) return new Result(0, 0, 0);

        var settings = await context.Settings.Where(s => s.Key == "app.base_url" || s.Key == "passage.date")
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        var baseUrl = (settings.GetValueOrDefault("app.base_url") is { Length: > 0 } b ? b : "http://localhost:5173").TrimEnd('/');
        var passageDate = DateOnly.TryParse(settings.GetValueOrDefault("passage.date"), out var d) ? d.ToString("dd/MM/yyyy") : "la date du passage";

        int emails = 0, notified = 0;
        foreach (var unit in units)
        {
            var leaderIds = await UnitNewMembersMail.UnitLeaderIdsAsync(context, unit.UnitId, ct);
            if (leaderIds.Count == 0) continue;

            var missingText = unit.Missing > 0 ? $"{unit.Missing} membre(s) sans ligne de passage. " : "";
            await notifications.NotifyMembersAsync(leaderIds, NotificationTypes.Info,
                $"Passage à terminer : {unit.Name}",
                $"{missingText}Cliquez sur « Terminer le passage de l'unité » avant le {passageDate}.", "/passage", ct);
            notified += leaderIds.Count;

            var people = await context.Members.Where(m => leaderIds.Contains(m.Id))
                .Select(m => new { m.Id, m.FirstName, m.LastName, m.PrimaryContactEmail }).ToListAsync(ct);
            var resolver = await ContactEmailResolver.LoadAsync(context, leaderIds, ct);
            var jobs = people
                .Select(p => new { p, Email = resolver.Resolve(p.Id, p.PrimaryContactEmail) })
                .Where(x => !string.IsNullOrWhiteSpace(x.Email))
                .DistinctBy(x => x.Email!.ToLowerInvariant())
                .Select(x => new EmailJob(TemplateCode, x.Email!, new Dictionary<string, string>
                {
                    ["leaderName"] = $"{x.p.FirstName} {x.p.LastName}".Trim(),
                    ["unitName"] = unit.Name,
                    ["missing"] = unit.Missing.ToString(),
                    ["passageDate"] = passageDate,
                    ["scoutYear"] = scoutYear,
                    ["passageUrl"] = $"{baseUrl}/passage",
                }))
                .ToList();
            if (jobs.Count > 0) { await emailQueue.EnqueueManyAsync(jobs, ct); emails += jobs.Count; }
        }
        return new Result(units.Count, emails, notified);
    }

    // Automatic run: while the passage is open and passage.date is set, send once at each threshold (7 days, then
    // 2 days before). Returns null when nothing was due.
    public static async Task<Result?> RunAutoAsync(IApplicationDbContext context, IEmailQueue emailQueue, INotificationService notifications,
        CancellationToken ct)
    {
        var s = await context.Settings
            .Where(x => x.Key == "passage.enabled" || x.Key == "passage.scout_year" || x.Key == "passage.date" || x.Key == MarkerKey)
            .ToListAsync(ct);
        string? Get(string k) => s.FirstOrDefault(x => x.Key == k)?.Value;
        var year = Get("passage.scout_year");
        if (Get("passage.enabled") != "true" || string.IsNullOrWhiteSpace(year)) return null;
        if (!DateOnly.TryParse(Get("passage.date"), out var date)) return null;

        var daysLeft = date.DayNumber - LebanonClock.Today.DayNumber;
        if (daysLeft < 0) return null; // the passage date is past

        // Which thresholds were already sent for this scout year.
        var marker = Get(MarkerKey) ?? "";
        var sent = marker.StartsWith(year + ":")
            ? marker[(year.Length + 1)..].Split(',', StringSplitOptions.RemoveEmptyEntries).ToHashSet()
            : [];
        // The closest threshold reached (a server that was down for a few days sends only the latest one).
        var due = AutoDaysBefore.Where(t => daysLeft <= t && !sent.Contains(t.ToString())).DefaultIfEmpty(-1).Min();
        if (due < 0) return null;

        var result = await SendAsync(context, emailQueue, notifications, year, ct);

        // Mark this threshold AND any larger one as done (don't send the 7-day reminder after the 2-day one).
        foreach (var t in AutoDaysBefore.Where(t => t >= due)) sent.Add(t.ToString());
        var value = $"{year}:{string.Join(',', sent.OrderByDescending(int.Parse))}";
        var row = s.FirstOrDefault(x => x.Key == MarkerKey);
        if (row is null)
            context.Settings.Add(new Setting { Key = MarkerKey, Value = value, Category = "passage", ValueType = "string", Label = "Rappels du passage envoyés",
                Description = "Rappels automatiques du passage déjà envoyés (interne)" });
        else row.Value = value;
        await context.SaveChangesAsync(ct);
        return result;
    }
}

// CG button "Relancer les unités non terminées".
public record RemindPassageUnitsCommand(string ScoutYear) : IRequest<Result<PassageReminders.Result>>;

public class RemindPassageUnitsCommandValidator : AbstractValidator<RemindPassageUnitsCommand>
{
    public RemindPassageUnitsCommandValidator()
        => RuleFor(x => x.ScoutYear).NotEmpty().MaximumLength(20).Matches(@"^[0-9\- ]+$")
            .WithMessage("Année scoute invalide (ex. 2026-2027).");
}

public class RemindPassageUnitsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IEmailQueue emailQueue,
    INotificationService notifications, IAuditService auditService) : IRequestHandler<RemindPassageUnitsCommand, Result<PassageReminders.Result>>
{
    public async ValueTask<Result<PassageReminders.Result>> Handle(RemindPassageUnitsCommand request, CancellationToken ct)
    {
        if (!PassageLocks.IsManager(currentUser))
            return Result<PassageReminders.Result>.Failure("Accès réservé à la maîtrise de groupe.");
        var r = await PassageReminders.SendAsync(context, emailQueue, notifications, request.ScoutYear, ct);
        if (r.Units == 0) return Result<PassageReminders.Result>.Failure("Toutes les unités ont terminé leur passage.");
        await auditService.LogAsync("RemindUnits", "Passage", null,
            newValues: new { request.ScoutYear, r.Units, r.Emails, r.Notified }, cancellationToken: ct);
        return Result<PassageReminders.Result>.Success(r);
    }
}
