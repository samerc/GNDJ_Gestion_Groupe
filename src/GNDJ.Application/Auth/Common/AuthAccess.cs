using System.Text.Json;
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
        var groupLevel = rows.Any(r => r.IsGroupLevel);

        // Access delegation ("accès délégué"): extra permissions the CG granted to THIS member directly (no
        // assignment/visible role). Merged in here — the single chokepoint feeding both login and refresh — so a
        // delegated incoming CG (or a granular "Camp BP only" grant) takes effect on the next token issue.
        var delegation = await context.Members
            .Where(m => m.Id == memberId)
            .Select(m => new { m.DelegatedPermissionsJson, m.DelegatedGroupAccess })
            .FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(delegation?.DelegatedPermissionsJson))
        {
            var extra = JsonSerializer.Deserialize<List<string>>(delegation.DelegatedPermissionsJson) ?? [];
            permissions = permissions.Union(extra).Distinct().ToList();
            // A full-CG delegation grants group-wide access (all units) so the stand-in can act everywhere.
            if (delegation.DelegatedGroupAccess) groupLevel = true;
        }

        // A group-level profile (Chef de Groupe) — or a full-CG delegation — sees ALL units, like a super-admin.
        var unitIds = groupLevel
            ? await context.Units.Select(u => u.Id).ToListAsync(ct)
            : rows.Select(r => r.UnitId).Distinct().ToList();

        return (permissions, unitIds);
    }
}
