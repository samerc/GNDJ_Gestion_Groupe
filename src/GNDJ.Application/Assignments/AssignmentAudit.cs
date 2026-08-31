using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Assignments;

// Builds a HUMAN-READABLE snapshot of an assignment for the audit log. The raw commands only knew GUIDs
// (MemberId/UnitId/TeamId/FunctionalRoleId), so an audit entry for "fixing a member's assignment" showed
// unreadable ids and no member name. This resolves the ids to names (member, unit, team, role) so the audit
// detail — and the diff between old/new — is legible. Audit is low-frequency (admin actions), so the few extra
// lookups are fine.
public static class AssignmentAudit
{
    // The keys here (Member/Unit/Team/Role/StartDate/EndDate) are translated to French labels by the audit-logs
    // page (FIELD_LABELS). Member is first so the row summary can show WHO the change was about.
    public sealed record Snapshot(string Member, string Unit, string? Team, string Role, string? StartDate, string? EndDate);

    public static async Task<Snapshot> DescribeAsync(
        IApplicationDbContext ctx, Guid memberId, Guid unitId, Guid? teamId, Guid roleId,
        DateOnly? start, DateOnly? end, CancellationToken ct)
    {
        var member = await ctx.Members.Where(m => m.Id == memberId)
            .Select(m => m.FirstName + " " + m.LastName).FirstOrDefaultAsync(ct) ?? memberId.ToString();
        var unit = await ctx.Units.Where(u => u.Id == unitId).Select(u => u.Name).FirstOrDefaultAsync(ct) ?? "—";
        var team = teamId.HasValue
            ? await ctx.Teams.Where(t => t.Id == teamId.Value).Select(t => t.Name).FirstOrDefaultAsync(ct)
            : null;
        var role = await ctx.FunctionalRoles.Where(r => r.Id == roleId).Select(r => r.Name).FirstOrDefaultAsync(ct) ?? "—";
        return new Snapshot(member, unit, team ?? "—", role,
            start?.ToString("yyyy-MM-dd"), end?.ToString("yyyy-MM-dd"));
    }
}
