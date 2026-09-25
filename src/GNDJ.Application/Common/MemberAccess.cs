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
    // The members.edit gate is load-bearing: it is the "Membres" domaine level, so member-file access is
    // GOVERNED by it and by nothing else (a profile whose Membres level is "Aucun" truly hides member files).
    public static async Task<bool> CanAccessMemberAsync(
        IApplicationDbContext context, ICurrentUserService currentUser, Guid memberId, CancellationToken ct)
    {
        if (currentUser.IsSuperAdmin) return true;
        if (currentUser.MemberId == memberId) return true;
        // Member-file access is decoupled from maitrise.manage: it requires the "Membres" domaine (members.edit).
        // A group profile with Membres = "Aucun" (no members.edit) can no longer open member files even if it
        // still holds maitrise.manage — so the per-domaine level tells the truth (slice 5). This is a no-op for
        // the current profiles (every maitrise.manage holder also holds members.edit) but keeps future edits honest.
        if (!currentUser.Permissions.Contains(Permissions.MembersEdit)) return false;
        // A whole-group manager (Chef de Groupe / Assistant CG) additionally reaches members with NO active
        // assignment (between assignments / alumni / orphans) — a CG holds all units anyway. This bypass is now
        // gated BEHIND the members.edit check above, so maitrise.manage only EXTENDS reach; it is never the base grant.
        if (IsGroupManager(currentUser)) return true;
        var authorizedUnitIds = currentUser.AuthorizedUnitIds;
        return await context.MemberAssignments.AnyAsync(a =>
            a.MemberId == memberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId), ct);
    }

    // READ vs WRITE. members.edit = full leader access (read + edit). members.view = READ-ONLY access to member files
    // (e.g. an "observateur" / trésorier profile): the same reach (own unit scope, or everyone for a group manager)
    // but only for READ handlers — every mutation still requires members.edit (or its own module write permission,
    // already enforced at the controller). Read-only youth hold NO permissions, so .view never leaks to them.
    public static bool HasMemberRead(ICurrentUserService currentUser)
        => currentUser.IsSuperAdmin
           || currentUser.Permissions.Contains(Permissions.MembersView)
           || currentUser.Permissions.Contains(Permissions.MembersEdit);

    // May the caller READ this member's data? Same rule as CanAccessMemberAsync, with members.view accepted.
    public static async Task<bool> CanViewMemberAsync(
        IApplicationDbContext context, ICurrentUserService currentUser, Guid memberId, CancellationToken ct)
    {
        if (currentUser.IsSuperAdmin) return true;
        if (currentUser.MemberId == memberId) return true;
        if (!HasMemberRead(currentUser)) return false;
        if (IsGroupManager(currentUser)) return true;
        var authorizedUnitIds = currentUser.AuthorizedUnitIds;
        return await context.MemberAssignments.AnyAsync(a =>
            a.MemberId == memberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId), ct);
    }

    // May the caller READ a whole unit's views (roster, document matrix, reports)? CanLeadUnit with members.view.
    public static bool CanViewUnit(ICurrentUserService currentUser, Guid unitId)
        => currentUser.IsSuperAdmin || (HasMemberRead(currentUser) && currentUser.AuthorizedUnitIds.Contains(unitId));

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
