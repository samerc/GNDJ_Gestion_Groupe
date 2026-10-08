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

    // Members created (or re-placed, « Déjà membre ? ») by THIS year's demandes (demande scout year = passage.scout_year).
    // « Envoyer les réponses » already puts them in next year's unit, so they are not part of this passage: otherwise,
    // once the responses go out before the passage is published, every newcomer shows as « sans ligne de passage »
    // and blocks publishing (by hand or scheduled), and the CUs get reminders about children they can't move.
    public static IQueryable<Guid> NewcomerIds(IApplicationDbContext context) =>
        context.Demandes
            .Where(d => d.CreatedMemberId != null
                && d.ScoutYear == context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefault())
            .Select(d => d.CreatedMemberId!.Value);

    // Active assignments of members who take part in the passage (no active maîtrise function anywhere, not a
    // newcomer of this year's demandes).
    public static IQueryable<MemberAssignment> ActiveYouth(IApplicationDbContext context) =>
        context.MemberAssignments.Where(a => a.EndDate == null
            && !context.MemberAssignments.Any(l => l.MemberId == a.MemberId && l.EndDate == null && l.FunctionalRole.IsMaitrise)
            && !NewcomerIds(context).Contains(a.MemberId));

    // Passage lines of members who take part in the passage (a line created before the member became a chef, or
    // before a « Déjà membre ? » re-placement, is left untouched but hidden and ignored — never applied on publish).
    public static IQueryable<Passage> Lines(IApplicationDbContext context) =>
        context.Passages.Where(p =>
            !context.MemberAssignments.Any(l => l.MemberId == p.MemberId && l.EndDate == null && l.FunctionalRole.IsMaitrise)
            && !NewcomerIds(context).Contains(p.MemberId));

    public const string LeaderRefused = "Les chefs ne font pas partie du passage : leurs fonctions se gèrent dans Maîtrises.";
}
