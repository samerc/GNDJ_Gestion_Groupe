using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Roles.Commands;
using Mediator;
using Microsoft.EntityFrameworkCore;
using P = GNDJ.Domain.Enums.Permissions;

namespace GNDJ.Application.Members;

// ── Access delegation ("accès délégué") ──
// The CG (roles.manage_group) / super-admin grants a SPECIFIC member extra access without any assignment or
// visible role — invisible everywhere a role would show (public site, maîtrises). Two shapes, combinable:
//   • Attach a PROFILE (e.g. "Chef de Groupe") — resolved LIVE at login (stays in sync if the profile changes);
//     a group-level profile also grants all units. This is how "acts as Chef de Groupe" works (replaces the old
//     one-off "full CG" snapshot). Capped: a non-super granter can only attach a profile within their own perms.
//   • A granular per-AREA grant (e.g. "Camp BP" only) stored as a permission set, capped + never system perms.
// Merged into the person's JWT at the next login / token refresh (see AuthAccess.LoadAsync).

// Overview row for the "Membres" tab (who holds a delegation). ProfileName = the attached profile (null if none);
// Areas = the granular areas as "Label (niveau)" strings.
public record MemberDelegationSummaryDto(Guid MemberId, string Name, string? UnitCode, string? ProfileName, IReadOnlyList<string> Areas);

public record GetMemberDelegationsQuery : IRequest<Result<IReadOnlyList<MemberDelegationSummaryDto>>>;

public class GetMemberDelegationsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberDelegationsQuery, Result<IReadOnlyList<MemberDelegationSummaryDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberDelegationSummaryDto>>> Handle(GetMemberDelegationsQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(P.RolesManageGroup))
            return Result<IReadOnlyList<MemberDelegationSummaryDto>>.Failure("Accès non autorisé.");

        // Members with ANY active delegation (an attached profile and/or ad-hoc areas) — a tiny set.
        var rows = await context.Members
            .Where(m => (m.DelegatedPermissionsJson != null && m.DelegatedPermissionsJson != "") || m.DelegatedProfileId != null)
            .Select(m => new
            {
                m.Id, m.FirstName, m.LastName, m.DelegatedPermissionsJson, m.DelegatedProfileId,
                UnitCode = m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault(),
            })
            .ToListAsync(ct);

        // Resolve the attached profiles' names in one round-trip.
        var profileIds = rows.Where(r => r.DelegatedProfileId != null).Select(r => r.DelegatedProfileId!.Value).Distinct().ToList();
        var profileNames = profileIds.Count == 0 ? [] : await context.SecurityProfiles
            .Where(p => profileIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name, ct);

        var list = rows
            .Select(r =>
            {
                var permSet = string.IsNullOrWhiteSpace(r.DelegatedPermissionsJson)
                    ? []
                    : (JsonSerializer.Deserialize<List<string>>(r.DelegatedPermissionsJson!) ?? []).ToHashSet();
                var areas = GroupAccessAreas.All
                    .Select(a => new { a.Label, Level = GroupAccessAreas.LevelOf(permSet, a) })
                    .Where(x => x.Level != "aucun")
                    .Select(x => $"{x.Label} ({x.Level})")
                    .ToList();
                var profileName = r.DelegatedProfileId is Guid pid && profileNames.TryGetValue(pid, out var n) ? n : null;
                return new MemberDelegationSummaryDto(r.Id, $"{r.FirstName} {r.LastName}", r.UnitCode, profileName, areas);
            })
            .OrderByDescending(x => x.ProfileName != null).ThenBy(x => x.Name)
            .ToList();

        return Result<IReadOnlyList<MemberDelegationSummaryDto>>.Success(list);
    }
}

// Current delegation for a member (the attached profile + per-area levels), for the dialog.
public record MemberDelegationDto(bool HasDelegation, Guid? ProfileId, string? ProfileName, IReadOnlyList<GroupAreaDto> Areas);

public record GetMemberDelegationQuery(Guid MemberId) : IRequest<Result<MemberDelegationDto>>;

public class GetMemberDelegationQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberDelegationQuery, Result<MemberDelegationDto>>
{
    public async ValueTask<Result<MemberDelegationDto>> Handle(GetMemberDelegationQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(P.RolesManageGroup))
            return Result<MemberDelegationDto>.Failure("Accès non autorisé.");

        var member = await context.Members
            .Where(m => m.Id == request.MemberId)
            .Select(m => new { m.DelegatedPermissionsJson, m.DelegatedProfileId, m.DelegatedGroupAccess })
            .FirstOrDefaultAsync(ct);
        if (member is null) return Result<MemberDelegationDto>.Failure("Membre introuvable.");

        // Legacy compatibility: an old full-CG snapshot (DelegatedGroupAccess, no profile ref) is presented as
        // "attach the Chef de Groupe profile" so re-saving migrates it cleanly to the profile reference.
        var profileId = member.DelegatedProfileId;
        if (profileId is null && member.DelegatedGroupAccess)
            profileId = await context.SecurityProfiles.Where(p => p.Code == "chef-de-groupe").Select(p => (Guid?)p.Id).FirstOrDefaultAsync(ct);

        var profileName = profileId is Guid pid
            ? await context.SecurityProfiles.Where(p => p.Id == pid).Select(p => p.Name).FirstOrDefaultAsync(ct)
            : null;

        var perms = string.IsNullOrWhiteSpace(member.DelegatedPermissionsJson)
            ? []
            : (JsonSerializer.Deserialize<List<string>>(member.DelegatedPermissionsJson) ?? []);
        var permSet = perms.ToHashSet();

        var areas = GroupAccessAreas.All
            .Select(a => new GroupAreaDto(a.Key, a.Label, GroupAccessAreas.LevelOf(permSet, a)))
            .ToList();

        return Result<MemberDelegationDto>.Success(
            new MemberDelegationDto(profileId != null || permSet.Count > 0, profileId, profileName, areas));
    }
}

// Set (or clear) a member's delegation. ProfileId = attach a profile (live); AreaLevels = granular per-area.
// Both optional and combinable. Empty (no profile + no areas) clears the delegation.
public record SetMemberDelegationCommand(Guid MemberId, Guid? ProfileId, Dictionary<string, string>? AreaLevels)
    : IRequest<Result<bool>>;

public class SetMemberDelegationCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SetMemberDelegationCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetMemberDelegationCommand request, CancellationToken ct)
    {
        var isSuper = currentUser.IsSuperAdmin;
        if (!isSuper && !currentUser.Permissions.Contains(P.RolesManageGroup))
            return Result<bool>.Failure("Accès non autorisé.");

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == request.MemberId, ct);
        if (member is null) return Result<bool>.Failure("Membre introuvable.");

        var callerPerms = currentUser.Permissions.ToHashSet();

        // Validate the attached profile (if any) + no-escalation cap: a non-super granter can only delegate a
        // profile whose permissions they all hold themselves.
        Guid? profileId = null;
        if (request.ProfileId is Guid pid)
        {
            var prof = await context.SecurityProfiles
                .Where(p => p.Id == pid)
                .Select(p => new { p.Id, Perms = p.Permissions.Select(x => x.Permission).ToList() })
                .FirstOrDefaultAsync(ct);
            if (prof is null) return Result<bool>.Failure("Profil introuvable.");
            if (!isSuper && !prof.Perms.All(callerPerms.Contains))
                return Result<bool>.Failure("Vous ne pouvez pas déléguer un profil qui dépasse vos propres accès.");
            profileId = pid;
        }

        // Granular ad-hoc areas → a permission set (never system/appointment perms; capped to the granter).
        var adHoc = new HashSet<string>();
        if (request.AreaLevels is { Count: > 0 })
        {
            foreach (var (key, level) in request.AreaLevels)
            {
                var area = GroupAccessAreas.All.FirstOrDefault(a => a.Key == key);
                if (area is not null) GroupAccessAreas.ApplyLevel(adHoc, area, level);
            }
            adHoc.ExceptWith(GroupAccessAreas.NonDelegatable);
            if (!isSuper) adHoc.IntersectWith(callerPerms);
        }

        if (profileId is null && adHoc.Count == 0)
        {
            // Nothing granted → clear the whole delegation (incl. the legacy flag).
            member.DelegatedProfileId = null;
            member.DelegatedPermissionsJson = null;
            member.DelegatedGroupAccess = false;
        }
        else
        {
            member.DelegatedProfileId = profileId;
            member.DelegatedPermissionsJson = adHoc.Count > 0 ? JsonSerializer.Serialize(adHoc.OrderBy(x => x).ToList()) : null;
            member.DelegatedGroupAccess = false; // scope now derives from the attached profile's IsGroupLevel (live)
        }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("SetDelegation", "Member", member.Id,
            newValues: new { ProfileId = profileId, Areas = adHoc.OrderBy(x => x).ToList() }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
