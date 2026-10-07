using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Meetings;

// "Absences de suite": how many réunions in a row a member has missed, counted back from their most recent one.
// A member's réunions = the APPROVED réunions of their current unit that concern them (whole unit, or their
// current team), up to today. Member-group réunions are not counted. Only the last 365 days are looked at.
// Used by the alert sent to the chef d'unité (setting attendance.absence_alert_count, 0 = off) and by
// the « À traiter » count on « Mon unité ».
public static class AbsenceStreaks
{
    public const string SettingKey = "attendance.absence_alert_count";

    // Current run for one member. LatestMeetingId = their most recent réunion; AlreadyAlerted = an absence of this
    // run already triggered an alert.
    public record Streak(int Count, Guid? LatestMeetingId, bool AlreadyAlerted);

    public static async Task<int> ThresholdAsync(IApplicationDbContext ctx, CancellationToken ct)
    {
        var v = await ctx.Settings.Where(s => s.Key == SettingKey).Select(s => s.Value).FirstOrDefaultAsync(ct);
        return int.TryParse(v, out var n) && n > 0 ? n : 0;
    }

    // Runs for the given members of one unit (all active members of the unit when memberIds is null).
    public static async Task<Dictionary<Guid, Streak>> ComputeAsync(
        IApplicationDbContext ctx, Guid unitId, IReadOnlyCollection<Guid>? memberIds, CancellationToken ct)
    {
        var today = LebanonClock.Today;
        var since = today.AddDays(-365);

        // Current team of each member in the unit (null = no team).
        var posts = await ctx.MemberAssignments
            .Where(a => a.UnitId == unitId && a.EndDate == null && (memberIds == null || memberIds.Contains(a.MemberId)))
            .Select(a => new { a.MemberId, a.TeamId })
            .ToListAsync(ct);
        var teamsOf = posts.GroupBy(p => p.MemberId)
            .ToDictionary(g => g.Key, g => g.Where(p => p.TeamId != null).Select(p => p.TeamId!.Value).ToHashSet());
        if (teamsOf.Count == 0) return [];

        var meetings = await ctx.Meetings
            .Where(m => m.UnitId == unitId && m.MemberGroupId == null && m.Status == MeetingStatuses.Approved
                && m.Date <= today && m.Date >= since)
            .Select(m => new { m.Id, m.Date, m.TeamId, m.CreatedAt })
            .ToListAsync(ct);
        if (meetings.Count == 0) return [];
        var meetingIds = meetings.Select(m => m.Id).ToList();
        var ids = teamsOf.Keys.ToList();
        var absences = await ctx.MeetingAbsences
            .Where(a => meetingIds.Contains(a.MeetingId) && ids.Contains(a.MemberId))
            .Select(a => new { a.MeetingId, a.MemberId, a.AlertSentAt })
            .ToListAsync(ct);
        var absent = absences.ToDictionary(a => (a.MeetingId, a.MemberId), a => a.AlertSentAt != null);

        // Newest first; two réunions the same day → the one created last counts as the newest.
        var ordered = meetings.OrderByDescending(m => m.Date).ThenByDescending(m => m.CreatedAt).ToList();
        var result = new Dictionary<Guid, Streak>();
        foreach (var (memberId, teams) in teamsOf)
        {
            var mine = ordered.Where(m => m.TeamId == null || teams.Contains(m.TeamId.Value));
            int count = 0; Guid? latest = null; var alerted = false;
            foreach (var m in mine)
            {
                latest ??= m.Id;
                if (!absent.TryGetValue((m.Id, memberId), out var flagged)) break; // present → the run stops
                count++;
                alerted |= flagged;
            }
            result[memberId] = new Streak(count, latest, alerted);
        }
        return result;
    }

    // After an attendance save: alert the unit's chefs about members whose run has just reached the threshold on
    // their most recent réunion, once per run. Stamps the triggering absence; the caller saves.
    public static async Task<List<(Guid MemberId, int Count)>> FindNewAlertsAsync(
        IApplicationDbContext ctx, Meeting meeting, IReadOnlyCollection<Guid> absentIds, CancellationToken ct)
    {
        if (meeting.MemberGroupId != null || meeting.Status != MeetingStatuses.Approved || absentIds.Count == 0) return [];
        var threshold = await ThresholdAsync(ctx, ct);
        if (threshold == 0) return [];
        var runs = await ComputeAsync(ctx, meeting.UnitId, absentIds, ct);
        return runs.Where(r => r.Value.LatestMeetingId == meeting.Id && r.Value.Count >= threshold && !r.Value.AlreadyAlerted)
            .Select(r => (r.Key, r.Value.Count)).ToList();
    }

    // The unit's chefs = members with an active post IN THE UNIT whose function grants members.edit (CU + ACU).
    // The Chef de Groupe is not included (their post is in the Groupe unit).
    public static async Task<List<Guid>> UnitChefIdsAsync(IApplicationDbContext ctx, Guid unitId, CancellationToken ct) =>
        await ctx.MemberAssignments
            .Where(a => a.UnitId == unitId && a.EndDate == null
                && a.FunctionalRole.SecurityProfile.Permissions.Any(p => p.Permission == Permissions.MembersEdit))
            .Select(a => a.MemberId).Distinct().ToListAsync(ct);
}
