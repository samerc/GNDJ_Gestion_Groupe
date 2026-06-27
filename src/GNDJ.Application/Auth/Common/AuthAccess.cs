using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Common;

// Builds the permission set + authorized unit ids that go into a user's JWT, used by both Login and
// RefreshToken. One round-trip over the member's active assignments (carrying each role's profile flag +
// permissions) instead of the previous 3-5 separate queries — matters under concurrent login bursts and
// on every silent token refresh.
public static class AuthAccess
{
    public static async Task<(List<string> Permissions, List<Guid> UnitIds)> LoadAsync(
        IApplicationDbContext context, Guid memberId, bool isSuperAdmin, CancellationToken ct)
    {
        // Super-admin: all permissions (in-memory) + all units.
        if (isSuperAdmin)
            return ([.. Domain.Enums.Permissions.All], await context.Units.Select(u => u.Id).ToListAsync(ct));

        var rows = await context.MemberAssignments
            .Where(a => a.MemberId == memberId && a.EndDate == null)
            .Select(a => new
            {
                a.UnitId,
                IsGroupLevel = a.FunctionalRole.SecurityProfile.IsGroupLevel,
                Perms = a.FunctionalRole.SecurityProfile.Permissions.Select(p => p.Permission).ToList()
            })
            .ToListAsync(ct);

        var permissions = rows.SelectMany(r => r.Perms).Distinct().ToList();

        // A group-level profile (Chef de Groupe) sees ALL units, like a super-admin.
        var unitIds = rows.Any(r => r.IsGroupLevel)
            ? await context.Units.Select(u => u.Id).ToListAsync(ct)
            : rows.Select(r => r.UnitId).Distinct().ToList();

        return (permissions, unitIds);
    }
}
