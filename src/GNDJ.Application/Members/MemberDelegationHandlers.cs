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
// visible role — invisible everywhere a role would show (public site, maîtrises). Two shapes, both reusing the
// same per-area model as the "Accès maîtrise" page (GroupAccessAreas):
//   • Full CG ("Chef de Groupe entrant"): the complete chef-de-groupe permission set + group-wide units, so an
//     incoming CG can run EVERYTHING (incl. the appointment tool) — covers a hand-off where the outgoing CG is
//     no longer available. Set before the role is formally changed, so no one sees the succession early.
//   • Granular: one or more delegable AREAS (e.g. "Camp BP" only) for any member (ACG, CU, ACU…). Never grants
//     the system/appointment perms (NonDelegatable), and stays capped to what the granter holds.
// The merged perms take effect on the person's next login / token refresh (see AuthAccess.LoadAsync).

// Overview row: one member who currently holds a delegation, for the Accès maîtrise page (tracking who has
// what). Areas = the granted areas as "Label (niveau)" strings (empty for a full-CG grant — FullCg says it all).
public record MemberDelegationSummaryDto(Guid MemberId, string Name, string? UnitCode, bool FullCg, IReadOnlyList<string> Areas);

public record GetMemberDelegationsQuery : IRequest<Result<IReadOnlyList<MemberDelegationSummaryDto>>>;

public class GetMemberDelegationsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberDelegationsQuery, Result<IReadOnlyList<MemberDelegationSummaryDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MemberDelegationSummaryDto>>> Handle(GetMemberDelegationsQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(P.RolesManageGroup))
            return Result<IReadOnlyList<MemberDelegationSummaryDto>>.Failure("Accès non autorisé.");

        // Only members with an active delegation (bounded, tiny set) — pulled with their current unit code.
        var rows = await context.Members
            .Where(m => m.DelegatedPermissionsJson != null && m.DelegatedPermissionsJson != "")
            .Select(m => new
            {
                m.Id, m.FirstName, m.LastName, m.DelegatedPermissionsJson, m.DelegatedGroupAccess,
                UnitCode = m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault(),
            })
            .ToListAsync(ct);

        var list = rows
            .Select(r =>
            {
                var permSet = (JsonSerializer.Deserialize<List<string>>(r.DelegatedPermissionsJson!) ?? []).ToHashSet();
                // Granular areas as "Label (niveau)"; omitted for a full-CG grant (the flag conveys it).
                var areas = r.DelegatedGroupAccess
                    ? []
                    : GroupAccessAreas.All
                        .Select(a => new { a.Label, Level = GroupAccessAreas.LevelOf(permSet, a) })
                        .Where(x => x.Level != "aucun")
                        .Select(x => $"{x.Label} ({x.Level})")
                        .ToList();
                return new MemberDelegationSummaryDto(r.Id, $"{r.FirstName} {r.LastName}", r.UnitCode, r.DelegatedGroupAccess, areas);
            })
            .OrderByDescending(x => x.FullCg).ThenBy(x => x.Name)
            .ToList();

        return Result<IReadOnlyList<MemberDelegationSummaryDto>>.Success(list);
    }
}

// Current delegation for a member (per-area levels + the full-CG flag), for the dialog.
public record MemberDelegationDto(bool HasDelegation, bool FullCg, IReadOnlyList<GroupAreaDto> Areas);

public record GetMemberDelegationQuery(Guid MemberId) : IRequest<Result<MemberDelegationDto>>;

public class GetMemberDelegationQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberDelegationQuery, Result<MemberDelegationDto>>
{
    public async ValueTask<Result<MemberDelegationDto>> Handle(GetMemberDelegationQuery request, CancellationToken ct)
    {
        // Only a CG (roles.manage_group) or super-admin may see/manage delegations.
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(P.RolesManageGroup))
            return Result<MemberDelegationDto>.Failure("Accès non autorisé.");

        var member = await context.Members
            .Where(m => m.Id == request.MemberId)
            .Select(m => new { m.DelegatedPermissionsJson, m.DelegatedGroupAccess })
            .FirstOrDefaultAsync(ct);
        if (member is null) return Result<MemberDelegationDto>.Failure("Membre introuvable.");

        var perms = string.IsNullOrWhiteSpace(member.DelegatedPermissionsJson)
            ? []
            : (JsonSerializer.Deserialize<List<string>>(member.DelegatedPermissionsJson) ?? []);
        var permSet = perms.ToHashSet();

        var areas = GroupAccessAreas.All
            .Select(a => new GroupAreaDto(a.Key, a.Label, GroupAccessAreas.LevelOf(permSet, a)))
            .ToList();

        return Result<MemberDelegationDto>.Success(
            new MemberDelegationDto(permSet.Count > 0, member.DelegatedGroupAccess, areas));
    }
}

// Set (or clear) a member's delegation. FullCg = grant the entire chef-de-groupe set + group access; otherwise
// apply the per-area levels. An empty grant clears the delegation.
public record SetMemberDelegationCommand(Guid MemberId, bool FullCg, Dictionary<string, string>? AreaLevels)
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

        var newPerms = new HashSet<string>();
        var groupAccess = false;

        if (request.FullCg)
        {
            // Full Chef de Groupe hand-off: the exact chef-de-groupe permission set (live — stays in sync) +
            // group-wide units. Includes the appointment power (roles.manage_group) on purpose.
            var cgPerms = await context.SecurityProfiles
                .Where(p => p.Code == "chef-de-groupe")
                .SelectMany(p => p.Permissions.Select(x => x.Permission))
                .ToListAsync(ct);
            foreach (var p in cgPerms) newPerms.Add(p);
            groupAccess = true;
        }
        else if (request.AreaLevels is { Count: > 0 })
        {
            // Granular: apply the requested level per delegable area (starting from empty).
            foreach (var (key, level) in request.AreaLevels)
            {
                var area = GroupAccessAreas.All.FirstOrDefault(a => a.Key == key);
                if (area is not null) GroupAccessAreas.ApplyLevel(newPerms, area, level);
            }
            // Never grant system / appointment perms through a granular delegation.
            newPerms.ExceptWith(GroupAccessAreas.NonDelegatable);
        }

        // No privilege escalation: a non-super granter can only delegate perms they themselves hold.
        if (!isSuper) newPerms.IntersectWith(currentUser.Permissions.ToHashSet());

        if (newPerms.Count == 0)
        {
            member.DelegatedPermissionsJson = null;
            member.DelegatedGroupAccess = false;
        }
        else
        {
            member.DelegatedPermissionsJson = JsonSerializer.Serialize(newPerms.OrderBy(x => x).ToList());
            member.DelegatedGroupAccess = groupAccess;
        }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("SetDelegation", "Member", member.Id,
            newValues: new { FullCg = request.FullCg, GroupAccess = member.DelegatedGroupAccess, Permissions = newPerms.OrderBy(x => x).ToList() },
            cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
