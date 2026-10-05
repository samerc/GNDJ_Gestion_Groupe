using System.Text.Json;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Calendar;

// Who is looking at the calendar, built from the member's ACTIVE posts (so the same rules work for the signed-in
// page and the anonymous phone-calendar link, which has no token claims):
//   • UnitIds / UnitTypeIds / TeamsByUnit — where they are a member (sees those units' and branches' events);
//   • LeadUnitIds — units where a post grants members.edit (chef / assistant: creates that unit's events and
//     sees all its réunions);
//   • IsMaitrise — holds an active maîtrise role;  IsCgTeam — holds an active group-level role (CG, ACG);
//   • IsManager — super-admin or maitrise.manage (Chef de Groupe team): creates group / branch / maîtrise /
//     CG-team events and may manage every event.
public sealed class CalendarViewer
{
    public Guid? MemberId { get; init; }
    public bool IsSuperAdmin { get; init; }
    public bool IsManager { get; init; }
    public bool IsCgTeam { get; init; }
    public bool IsMaitrise { get; init; }
    public HashSet<Guid> UnitIds { get; init; } = [];
    public HashSet<Guid> UnitTypeIds { get; init; } = [];
    public HashSet<Guid> LeadUnitIds { get; init; } = [];
    public Dictionary<Guid, HashSet<Guid>> TeamsByUnit { get; init; } = [];

    // extraPermissions: the signed-in user's token permissions (incl. delegations); null for the phone feed.
    public static async Task<CalendarViewer> LoadAsync(IApplicationDbContext context, Guid? memberId, bool isSuperAdmin,
        IReadOnlyCollection<string>? extraPermissions, CancellationToken ct)
    {
        var posts = memberId is null ? [] : await context.MemberAssignments
            .Where(a => a.MemberId == memberId && a.EndDate == null && !a.Unit.IsDeleted)
            .Select(a => new
            {
                a.UnitId, a.Unit.UnitTypeId, a.TeamId, a.FunctionalRole.IsMaitrise,
                GroupLevel = a.FunctionalRole.SecurityProfile.IsGroupLevel,
                Edit = a.FunctionalRole.SecurityProfile.Permissions.Any(p => p.Permission == Permissions.MembersEdit),
                Manage = a.FunctionalRole.SecurityProfile.Permissions.Any(p => p.Permission == Permissions.MaitriseManage),
            }).ToListAsync(ct);

        var manager = isSuperAdmin || posts.Any(p => p.Manage) || (extraPermissions?.Contains(Permissions.MaitriseManage) ?? false);
        return new CalendarViewer
        {
            MemberId = memberId,
            IsSuperAdmin = isSuperAdmin,
            IsManager = manager,
            IsCgTeam = manager || posts.Any(p => p.GroupLevel),
            IsMaitrise = posts.Any(p => p.IsMaitrise),
            UnitIds = posts.Select(p => p.UnitId).ToHashSet(),
            UnitTypeIds = posts.Select(p => p.UnitTypeId).ToHashSet(),
            LeadUnitIds = posts.Where(p => p.Edit).Select(p => p.UnitId).ToHashSet(),
            TeamsByUnit = posts.Where(p => p.TeamId != null).GroupBy(p => p.UnitId)
                .ToDictionary(g => g.Key, g => g.Select(p => p.TeamId!.Value).ToHashSet()),
        };
    }

    public bool CanSee(CalendarEvent e) => IsManager || e.Audience switch
    {
        CalendarAudiences.Group => true,
        CalendarAudiences.Branch => e.UnitTypeId is Guid t && UnitTypeIds.Contains(t),
        CalendarAudiences.Unit => e.UnitId is Guid u && UnitIds.Contains(u),
        CalendarAudiences.Maitrise => IsMaitrise,
        CalendarAudiences.CgTeam => IsCgTeam,
        _ => false,
    };

    // A chef d'unité only creates / edits their own unit's events; the CG team creates and edits everything.
    public bool CanEdit(string audience, Guid? unitId) =>
        IsManager || (audience == CalendarAudiences.Unit && unitId is Guid u && LeadUnitIds.Contains(u));

    public bool CanCreateAnything => IsManager || LeadUnitIds.Count > 0;
}

// Repeating events: one row expanded into its occurrence dates inside a window.
public static class CalendarRecurrence
{
    private const int MaxOccurrences = 1000;

    public static HashSet<DateOnly> Exceptions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return (JsonSerializer.Deserialize<List<DateOnly>>(json) ?? []).ToHashSet(); }
        catch (JsonException) { return []; }
    }

    public static string? SerializeExceptions(IEnumerable<DateOnly> dates)
    {
        var list = dates.Distinct().Order().ToList();
        return list.Count == 0 ? null : JsonSerializer.Serialize(list);
    }

    // Start dates of the occurrences that overlap [from, to] (a multi-day event keeps its length on each occurrence).
    public static IEnumerable<DateOnly> Occurrences(CalendarEvent e, DateOnly from, DateOnly to)
    {
        var length = e.EndDate is DateOnly end ? end.DayNumber - e.StartDate.DayNumber : 0;
        var skip = Exceptions(e.ExceptionDatesJson);
        var interval = Math.Max(1, e.RecurrenceInterval);
        for (var i = 0; i < MaxOccurrences; i++)
        {
            var start = e.Recurrence switch
            {
                CalendarRecurrences.Weekly => e.StartDate.AddDays(7 * interval * i),
                CalendarRecurrences.Monthly => e.StartDate.AddMonths(interval * i),
                _ => i == 0 ? e.StartDate : DateOnly.MaxValue,
            };
            if (start == DateOnly.MaxValue || start > to) yield break;
            if (e.RecurrenceUntil is DateOnly until && start > until) yield break;
            if (start.AddDays(length) >= from && !skip.Contains(start)) yield return start;
        }
    }
}

// What the calendar shows: our own events + the units' réunions / sorties / camps + the year's important dates.
public record CalendarItemDto(
    string Id, string Kind, Guid? EventId, Guid? MeetingId,
    string Title, string? Description, string? Location,
    DateOnly Date, DateOnly? EndDate, TimeOnly? StartTime, TimeOnly? EndTime,
    string Audience, string AudienceLabel, Guid? UnitId, string? UnitCode,
    bool Recurring, bool CanEdit, string? MeetingType);

public static class CalendarItemKinds
{
    public const string Event = "event";
    public const string Meeting = "meeting";
    public const string Date = "date";
}

public static class CalendarFeed
{
    // The year's important dates, read from the settings. Families' enrolment dates are for the CG team only.
    private static readonly (string Key, string Label, bool CgOnly)[] ImportantDates =
    [
        ("documents.deposit_start", "Ouverture du dépôt des documents", false),
        ("documents.deposit_deadline", "Date limite de dépôt des documents", false),
        ("documents.correction_start", "Ouverture de la correction des documents", false),
        ("documents.correction_deadline", "Date limite de correction des documents", false),
        ("documents.final_deadline", "Date finale des documents", false),
        ("passage.date", "Passage", false),
        ("passage.first_meeting_date", "Première réunion de l'année", false),
        ("demande.submission_start", "Ouverture des inscriptions", true),
        ("demande.submission_deadline", "Date limite des inscriptions", true),
    ];

    // Everything this viewer sees in [from, to], sorted. meetingUnitId: a manager looking at one unit's réunions
    // (managers otherwise get réunions only for the units they belong to, so the group view isn't flooded).
    public static async Task<List<CalendarItemDto>> LoadAsync(IApplicationDbContext context, CalendarViewer viewer,
        DateOnly from, DateOnly to, Guid? meetingUnitId, CancellationToken ct)
    {
        var items = new List<CalendarItemDto>();
        var units = await context.Units.Select(u => new { u.Id, u.Code, u.Name }).ToDictionaryAsync(u => u.Id, ct);
        var unitTypes = await context.UnitTypes.Select(t => new { t.Id, t.Name }).ToDictionaryAsync(t => t.Id, t => t.Name, ct);

        // 1. Our events (only those that can have an occurrence in the window).
        var events = await context.CalendarEvents
            .Where(e => e.StartDate <= to && (e.Recurrence != CalendarRecurrences.None || (e.EndDate ?? e.StartDate) >= from))
            .Where(e => e.RecurrenceUntil == null || e.RecurrenceUntil >= from)
            .ToListAsync(ct);
        foreach (var e in events.Where(viewer.CanSee))
        {
            var label = AudienceLabel(e.Audience, e.UnitId is Guid u && units.TryGetValue(u, out var un) ? un.Name : null,
                e.UnitTypeId is Guid t ? unitTypes.GetValueOrDefault(t) : null);
            var length = e.EndDate is DateOnly end ? end.DayNumber - e.StartDate.DayNumber : 0;
            foreach (var d in CalendarRecurrence.Occurrences(e, from, to))
                items.Add(new CalendarItemDto($"e:{e.Id}:{d:yyyy-MM-dd}", CalendarItemKinds.Event, e.Id, null,
                    e.Title, e.Description, e.Location, d, length > 0 ? d.AddDays(length) : null, e.StartTime, e.EndTime,
                    e.Audience, label, e.UnitId, e.UnitId is Guid uid && units.TryGetValue(uid, out var uu) ? uu.Code : null,
                    e.Recurrence != CalendarRecurrences.None, viewer.CanEdit(e.Audience, e.UnitId), null));
        }

        // 2. Réunions / sorties / camps of the viewer's units (all of them for that unit's chefs; for the others the
        //    approved ones of the whole unit or of their own team). Group-roster réunions are not shown here.
        var meetingUnits = viewer.UnitIds.ToHashSet();
        if (meetingUnitId is Guid mu && (viewer.IsManager || viewer.UnitIds.Contains(mu))) meetingUnits.Add(mu);
        if (meetingUnits.Count > 0)
        {
            var meetings = await context.Meetings
                .Where(m => meetingUnits.Contains(m.UnitId) && m.MemberGroupId == null
                            && m.Date <= to && (m.EndDate ?? m.Date) >= from)
                .Select(m => new { m.Id, m.UnitId, m.TeamId, TeamName = m.Team != null ? m.Team.Name : null, m.Type, m.Title, m.Date, m.EndDate, m.Status, m.Notes })
                .ToListAsync(ct);
            foreach (var m in meetings)
            {
                var leads = viewer.IsManager || viewer.LeadUnitIds.Contains(m.UnitId);
                if (!leads && m.Status != MeetingStatuses.Approved) continue;
                if (!leads && m.TeamId is Guid team && !(viewer.TeamsByUnit.GetValueOrDefault(m.UnitId)?.Contains(team) ?? false)) continue;
                var unit = units.GetValueOrDefault(m.UnitId);
                var typeLabel = m.Type switch { MeetingTypes.Sortie => "Sortie", MeetingTypes.Camp => "Camp", _ => "Réunion" };
                var title = string.IsNullOrWhiteSpace(m.Title) ? typeLabel : $"{typeLabel} : {m.Title}";
                if (m.Status != MeetingStatuses.Approved) title += " (à approuver)";
                items.Add(new CalendarItemDto($"m:{m.Id}", CalendarItemKinds.Meeting, null, m.Id, title, m.Notes, null,
                    m.Date, m.EndDate, null, null, CalendarAudiences.Unit,
                    m.TeamName is null ? unit?.Name ?? "" : $"{unit?.Name} · {m.TeamName}", m.UnitId, unit?.Code, false, false, m.Type));
            }
        }

        // 3. Important dates of the year (settings).
        var keys = ImportantDates.Select(d => d.Key).ToList();
        var values = await context.Settings.Where(s => keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        foreach (var (key, label, cgOnly) in ImportantDates)
        {
            if (cgOnly && !viewer.IsCgTeam) continue;
            if (!DateOnly.TryParseExact(values.GetValueOrDefault(key), "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out var d) || d < from || d > to) continue;
            items.Add(new CalendarItemDto($"d:{key}", CalendarItemKinds.Date, null, null, label, null, null, d, null, null, null,
                cgOnly ? CalendarAudiences.CgTeam : CalendarAudiences.Group, cgOnly ? "Équipe du Chef de Groupe" : "Tout le groupe",
                null, null, false, false, null));
        }

        return items.OrderBy(i => i.Date).ThenBy(i => i.StartTime ?? TimeOnly.MinValue).ThenBy(i => i.Title).ToList();
    }

    public static string AudienceLabel(string audience, string? unitName, string? unitTypeName) => audience switch
    {
        CalendarAudiences.Group => "Tout le groupe",
        CalendarAudiences.Branch => $"Branche : {unitTypeName}",
        CalendarAudiences.Unit => unitName ?? "Unité",
        CalendarAudiences.Maitrise => "Maîtrise",
        CalendarAudiences.CgTeam => "Équipe du Chef de Groupe",
        _ => audience,
    };
}
