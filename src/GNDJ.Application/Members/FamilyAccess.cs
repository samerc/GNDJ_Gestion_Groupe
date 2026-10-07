using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members;

// Rules for moving between the accounts of one family (a CONFIRMED fratrie = same SiblingGroupId).
//   • Switching WITHOUT a password is allowed when both accounts lead to the same main contact email (the parent
//     already proved they own it) and NEITHER account is "protected".
//   • Protected = holds an active maîtrise function, a group-level function, delegated access, or is super-admin:
//     those accounts carry more than a child's data, so their password is always asked.
//   • « Ma famille » shows each child's to-do, except for a protected sibling (name only).
public static class FamilyAccess
{
    public record FamilyMember(Guid MemberId, string FirstName, string LastName, DateOnly? DateOfBirth,
        Guid? UserId, string? Username, bool Protected, string? MainEmail);

    // The caller + their confirmed siblings (non-deleted), with login + protection + main email.
    // Empty when the caller has no confirmed fratrie.
    public static async Task<List<FamilyMember>> LoadAsync(IApplicationDbContext ctx, Guid memberId, CancellationToken ct)
    {
        var groupId = await ctx.Members.Where(m => m.Id == memberId).Select(m => m.SiblingGroupId).FirstOrDefaultAsync(ct);
        if (groupId is null) return [];

        var rows = await ctx.Members
            .Where(m => m.SiblingGroupId == groupId && !m.IsDeleted)
            .Select(m => new
            {
                m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.PrimaryContactEmail,
                Delegated = m.DelegatedPermissionsJson != null || m.DelegatedGroupAccess || m.DelegatedProfileId != null,
                Leader = m.Assignments.Any(a => a.EndDate == null && !a.IsDeleted
                    && (a.FunctionalRole.IsMaitrise || a.FunctionalRole.SecurityProfile.IsGroupLevel)),
                User = ctx.Users.Where(u => u.MemberId == m.Id && u.IsActive && !u.IsDeleted)
                    .Select(u => new { u.Id, u.Email, u.IsSuperAdmin }).FirstOrDefault(),
            })
            .ToListAsync(ct);

        var emails = await ContactEmailResolver.LoadAsync(ctx, rows.Select(r => r.Id).ToList(), ct);
        return rows.Select(r => new FamilyMember(
                r.Id, r.FirstName, r.LastName, r.DateOfBirth, r.User?.Id, r.User?.Email,
                Protected: r.Leader || r.Delegated || (r.User?.IsSuperAdmin ?? false),
                MainEmail: emails.Resolve(r.Id, r.PrimaryContactEmail)?.Trim().ToLowerInvariant()))
            .OrderBy(r => r.DateOfBirth ?? DateOnly.MaxValue).ThenBy(r => r.FirstName)
            .ToList();
    }

    public static bool CanSwitchWithoutPassword(FamilyMember me, FamilyMember target) =>
        !me.Protected && !target.Protected
        && !string.IsNullOrEmpty(me.MainEmail) && me.MainEmail == target.MainEmail;
}
