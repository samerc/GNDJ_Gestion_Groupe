using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;

namespace GNDJ.Application.Common;

// Resolves a MemberGroup's live membership: the active-member assignments that belong to the group =
// (union of its include rules) minus (union of its exclude rules), constrained to the group's scope.
// Returns an IQueryable<MemberAssignment> so callers can project/count without materializing. The group MUST
// be loaded WITH its Rules. Reusable anywhere a rule-based member set is needed (réunions today, more later).
public static class MemberGroupResolver
{
    public static IQueryable<MemberAssignment> RosterQuery(IApplicationDbContext ctx, MemberGroup g)
    {
        // Base scope: active (non-ended) assignments, narrowed by the group's scope.
        IQueryable<MemberAssignment> scope = ctx.MemberAssignments.Where(a => a.EndDate == null && !a.IsDeleted);
        if (g.ScopeType == MemberGroupScopes.Unit && g.UnitId is Guid u)
            scope = scope.Where(a => a.UnitId == u);
        else if (g.ScopeType == MemberGroupScopes.UnitType && g.UnitTypeId is Guid ut)
            scope = scope.Where(a => a.Unit.UnitTypeId == ut);

        var includes = g.Rules.Where(r => r.Include).ToList();
        if (includes.Count == 0) return scope.Where(_ => false); // no members without an include rule

        // Union the include rules (UNION ALL in SQL; callers dedupe by member).
        IQueryable<MemberAssignment>? included = null;
        foreach (var r in includes)
        {
            var part = Apply(scope, r);
            included = included is null ? part : included.Concat(part);
        }
        var result = included!;

        // Remove exclude rules (by member id).
        foreach (var r in g.Rules.Where(r => !r.Include))
        {
            var excludedMemberIds = Apply(scope, r).Select(a => a.MemberId);
            result = result.Where(a => !excludedMemberIds.Contains(a.MemberId));
        }
        return result;
    }

    // Filters the scope by one rule's criterion. GUID values are parsed OUTSIDE the expression tree (EF can't
    // translate Guid.Parse); a malformed/empty value yields an empty set rather than throwing.
    private static IQueryable<MemberAssignment> Apply(IQueryable<MemberAssignment> scope, MemberGroupRule r)
    {
        switch (r.Criterion)
        {
            case MemberGroupCriteria.Everyone: return scope;
            case MemberGroupCriteria.Maitrise: return scope.Where(a => a.FunctionalRole.IsMaitrise);
            case MemberGroupCriteria.Youth: return scope.Where(a => !a.FunctionalRole.IsMaitrise);
            case MemberGroupCriteria.TeamLeader: return scope.Where(a => a.FunctionalRole.IsTeamLeader);
            case MemberGroupCriteria.Profile:
                var code = r.Value ?? "";
                return scope.Where(a => a.FunctionalRole.SecurityProfile.Code == code);
            case MemberGroupCriteria.Role:
                return Guid.TryParse(r.Value, out var roleId)
                    ? scope.Where(a => a.FunctionalRoleId == roleId) : scope.Where(_ => false);
            case MemberGroupCriteria.Unit:
                return Guid.TryParse(r.Value, out var unitId)
                    ? scope.Where(a => a.UnitId == unitId) : scope.Where(_ => false);
            case MemberGroupCriteria.UnitType:
                return Guid.TryParse(r.Value, out var utId)
                    ? scope.Where(a => a.Unit.UnitTypeId == utId) : scope.Where(_ => false);
            case MemberGroupCriteria.Member:
                return Guid.TryParse(r.Value, out var memberId)
                    ? scope.Where(a => a.MemberId == memberId) : scope.Where(_ => false);
            default: return scope.Where(_ => false);
        }
    }
}
