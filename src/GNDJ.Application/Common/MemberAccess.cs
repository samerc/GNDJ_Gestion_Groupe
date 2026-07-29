using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Single source of truth for member-data authorization, shared by every handler that reads or mutates a
// member's personal data (detail, documents, cotisations, guardians, progression, custom fields, contacts,
// card, ...). Consolidated from ~20 hand-copied checks so the policy can never drift between features.
public static class MemberAccess
{
    // May the caller touch THIS member's data? super-admin, OR the member themselves (own record), OR a
    // members.edit leader with an ACTIVE assignment of the member in one of their authorized units.
    // The members.edit gate is load-bearing: the read-only youth profile holds every ".view" permission
    // AND carries its own unit in AuthorizedUnitIds, so a unit-only check would leak every co-member's data.
    public static async Task<bool> CanAccessMemberAsync(
        IApplicationDbContext context, ICurrentUserService currentUser, Guid memberId, CancellationToken ct)
    {
        if (currentUser.IsSuperAdmin) return true;
        if (currentUser.MemberId == memberId) return true;
        if (!currentUser.Permissions.Contains(Permissions.MembersEdit)) return false;
        var authorizedUnitIds = currentUser.AuthorizedUnitIds;
        return await context.MemberAssignments.AnyAsync(a =>
            a.MemberId == memberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId), ct);
    }

    // Leader-level access to a whole UNIT (compliance matrices, unit-wide reports, passage, trombinoscope).
    // super-admin OR a members.edit holder with that unit in scope. A ".view"-only youth must never unlock
    // unit-wide views, hence the members.edit gate rather than bare AuthorizedUnitIds membership.
    public static bool CanLeadUnit(ICurrentUserService currentUser, Guid unitId)
        => currentUser.IsSuperAdmin
           || (currentUser.Permissions.Contains(Permissions.MembersEdit) && currentUser.AuthorizedUnitIds.Contains(unitId));

    // Whole-group manager: super-admin OR a maitrise.manage holder (Chef de Groupe / Assistant CG /
    // association-admin). Used as defense-in-depth on group-wide aggregate views that expose sensitive data
    // (the enrollment queue with children's medical/PII, group statistics), so a future accidental grant of
    // a bare ".view" permission can't re-expose them.
    public static bool IsGroupManager(ICurrentUserService currentUser)
        => currentUser.IsSuperAdmin || currentUser.Permissions.Contains(Permissions.MaitriseManage);
}
