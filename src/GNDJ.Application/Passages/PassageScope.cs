using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;

namespace GNDJ.Application.Passages;

// Who takes part in the passage. Chefs — anyone holding an ACTIVE maîtrise function (IsMaitrise), in any unit —
// are NOT part of it: the passage is the youth's path through the branches, and leader roles are given on the
// Maîtrises page / the member's Postes. So a chef gets no passage line, isn't counted as "missing", and doesn't
// hold up finishing a unit or publishing. Every passage roster / count goes through here so the rule is the same
// on the CU page, the CG page, the finalize gates, the reminders, the rentrée progress and the dashboard.
public static class PassageScope
{
    // Members holding an active maîtrise function anywhere.
    public static IQueryable<Guid> LeaderIds(IApplicationDbContext context) =>
        context.MemberAssignments
            .Where(a => a.EndDate == null && a.FunctionalRole.IsMaitrise)
            .Select(a => a.MemberId);

    // Active assignments of members who take part in the passage (no active maîtrise function anywhere).
    public static IQueryable<MemberAssignment> ActiveYouth(IApplicationDbContext context) =>
        context.MemberAssignments.Where(a => a.EndDate == null
            && !context.MemberAssignments.Any(l => l.MemberId == a.MemberId && l.EndDate == null && l.FunctionalRole.IsMaitrise));

    // Passage lines of members who take part in the passage (a line created before the member became a chef
    // is left untouched but hidden and ignored).
    public static IQueryable<Passage> Lines(IApplicationDbContext context) =>
        context.Passages.Where(p =>
            !context.MemberAssignments.Any(l => l.MemberId == p.MemberId && l.EndDate == null && l.FunctionalRole.IsMaitrise));

    public const string LeaderRefused = "Les chefs ne font pas partie du passage : leurs fonctions se gèrent dans Maîtrises.";
}
