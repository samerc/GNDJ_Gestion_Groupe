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
            .Select(m => new { m.DelegatedPermissionsJson, m.DelegatedGroupAccess, m.DelegatedProfileId })
            .FirstOrDefaultAsync(ct);
        if (delegation is not null)
        {
            // (a) Ad-hoc per-domaine grant stored as a JSON permission array.
            if (!string.IsNullOrWhiteSpace(delegation.DelegatedPermissionsJson))
            {
                var extra = JsonSerializer.Deserialize<List<string>>(delegation.DelegatedPermissionsJson) ?? [];
                permissions = permissions.Union(extra).Distinct().ToList();
            }
            // (b) LEGACY full-CG snapshot flag → group-wide access. New grants use the profile ref below.
            if (delegation.DelegatedGroupAccess) groupLevel = true;
            // (c) Attached profile, resolved LIVE (stays in sync): its permissions are unioned in, and a
            // group-level profile grants all units — this is how "acts as Chef de Groupe" works.
            if (delegation.DelegatedProfileId is Guid profileId)
            {
                var prof = await context.SecurityProfiles
                    .Where(p => p.Id == profileId)
                    .Select(p => new { p.IsGroupLevel, Perms = p.Permissions.Select(x => x.Permission).ToList() })
                    .FirstOrDefaultAsync(ct);
                if (prof is not null)
                {
                    permissions = permissions.Union(prof.Perms).Distinct().ToList();
                    if (prof.IsGroupLevel) groupLevel = true;
                }
            }
        }

        // Commission BP: a member named on an ACTIVE camp's commission can run the camp screens (camp.manage +
        // camp.grade) — and nothing else. Stops applying as soon as the camp is archived.
        var onCommission = await context.CampCommissionMembers
            .AnyAsync(c => c.MemberId == memberId && !c.Camp.IsDeleted && !c.Camp.IsArchived, ct);
        if (onCommission)
            permissions = permissions.Union([Domain.Enums.Permissions.CampManage, Domain.Enums.Permissions.CampGrade]).Distinct().ToList();

        // A group-level profile (Chef de Groupe) — or a full-CG delegation — sees ALL units, like a super-admin.
        var unitIds = groupLevel
            ? await context.Units.Select(u => u.Id).ToListAsync(ct)
            : rows.Select(r => r.UnitId).Distinct().ToList();

        return (permissions, unitIds);
    }
}
