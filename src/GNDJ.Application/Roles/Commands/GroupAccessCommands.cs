using GNDJ.Application.Common.Content;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;
using P = GNDJ.Domain.Enums.Permissions;

namespace GNDJ.Application.Roles.Commands;

// Per-area access the CG can delegate to group staff (ACG, Aumônier…). Each area maps to a "Lecture"
// (view) and "Complet" (view + manage) permission set. Areas NOT listed here (org structure, roles,
// settings) are never delegated — see NonDelegatable below.
public static class GroupAccessAreas
{
    public record Area(string Key, string Label, string[] View, string[] Manage);

    public static readonly Area[] All =
    [
        new("membres", "Membres", [P.MembersView], [P.MembersCreate, P.MembersEdit, P.MembersDelete, P.MembersResetPassword]),
        new("affectations", "Affectations", [P.AssignmentsView], [P.AssignmentsCreate, P.AssignmentsEdit, P.AssignmentsDelete]),
        new("famille", "Famille", [P.RelationshipsView], [P.RelationshipsCreate, P.RelationshipsEdit, P.RelationshipsDelete]),
        new("documents", "Documents", [P.DocumentsView], [P.DocumentsCreate, P.DocumentsEdit, P.DocumentsDelete, P.DocumentsApprove]),
        new("cotisations", "Cotisations", [P.CotisationsView], [P.CotisationsCreate, P.CotisationsEdit, P.CotisationsDelete]),
        new("progression", "Progression", [P.ProgressionView], [P.ProgressionManage]),
        new("passages", "Passages", [P.PassageView], [P.PassagePropose, P.PassageManage]),
        new("demandes", "Demandes d'inscription", [P.DemandeView], [P.DemandeManage]),
        // Camp BP is CG-only by default; the CG appoints a specific ACG here. Lecture = grade participants,
        // Complet = full camp management (draft familles, jeux, reports).
        new("camp", "Camp BP", [P.CampGrade], [P.CampManage]),
        new("site", "Site public", [], [P.ContentManage]),
        new("audit", "Journal d'audit", [P.AuditView], []),
    ];

    // Meta / system permissions that are NEVER granted to a delegated (assistant) profile, even if the
    // CG who edits it holds them — prevents an assistant from gaining admin or access-management powers.
    public static readonly HashSet<string> NonDelegatable =
    [
        // The CG-only APPOINTMENT tool (roles.manage_group) + system/admin permissions: never granted to a
        // delegated profile, even if the CG editing it holds them. NOTE: maitrise.manage is NOT here — it's
        // shared with assistants, so a forked (appointed) ACG profile must keep it rather than have it stripped.
        P.RolesManage, P.RolesManageGroup, P.AssociationsManage, P.UnitTypesManage,
        P.UnitsCreate, P.UnitsEdit, P.UnitsDelete, P.AdminHardDelete,
    ];

    public static string LevelOf(HashSet<string> perms, Area a)
    {
        if (a.Manage.Length > 0 && a.Manage.All(perms.Contains)) return "complet";
        if (a.View.Length > 0 && a.View.All(perms.Contains)) return "lecture";
        return "aucun";
    }

    public static void ApplyLevel(HashSet<string> perms, Area a, string level)
    {
        foreach (var p in a.View) perms.Remove(p);
        foreach (var p in a.Manage) perms.Remove(p);
        if (level == "lecture") foreach (var p in a.View) perms.Add(p);
        else if (level == "complet") { foreach (var p in a.View) perms.Add(p); foreach (var p in a.Manage) perms.Add(p); }
    }
}

// ── Query: group functions + their current per-area access level ──
public record GroupAreaDto(string Key, string Label, string Level);
public record GroupFunctionAccessDto(Guid FunctionalRoleId, string Name, string Code, bool Editable, IReadOnlyList<GroupAreaDto> Areas);

public record GetGroupFunctionAccessQuery : IRequest<IReadOnlyList<GroupFunctionAccessDto>>;

public class GetGroupFunctionAccessQueryHandler(IApplicationDbContext context) : IRequestHandler<GetGroupFunctionAccessQuery, IReadOnlyList<GroupFunctionAccessDto>>
{
    public async ValueTask<IReadOnlyList<GroupFunctionAccessDto>> Handle(GetGroupFunctionAccessQuery request, CancellationToken ct)
    {
        var roles = await context.FunctionalRoles
            .Where(r => !r.IsArchived && r.SecurityProfile.IsGroupLevel)
            .Select(r => new { r.Id, r.Name, r.Code, Perms = r.SecurityProfile.Permissions.Select(p => p.Permission).ToList() })
            .ToListAsync(ct);

        return roles
            .OrderByDescending(r => r.Code == "CG").ThenBy(r => r.Name)
            .Select(r =>
            {
                var perms = r.Perms.ToHashSet();
                return new GroupFunctionAccessDto(r.Id, r.Name, r.Code,
                    r.Code != "CG", // the Chef de Groupe function itself is read-only here
                    GroupAccessAreas.All.Select(a => new GroupAreaDto(a.Key, a.Label, GroupAccessAreas.LevelOf(perms, a))).ToList());
            })
            .ToList();
    }
}

// ── Command: set a group function's per-area access (forks a shared profile so others are untouched) ──
public record SetGroupFunctionAccessCommand(Guid FunctionalRoleId, Dictionary<string, string> AreaLevels) : IRequest<Result<bool>>;

public class SetGroupFunctionAccessCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SetGroupFunctionAccessCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetGroupFunctionAccessCommand request, CancellationToken ct)
    {
        var role = await context.FunctionalRoles
            .Include(r => r.SecurityProfile).ThenInclude(sp => sp.Permissions)
            .FirstOrDefaultAsync(r => r.Id == request.FunctionalRoleId, ct);
        if (role is null) return Result<bool>.Failure("Fonction introuvable.");
        if (!role.SecurityProfile.IsGroupLevel) return Result<bool>.Failure("Cette fonction n'est pas une fonction de maîtrise de groupe.");
        if (role.Code == "CG") return Result<bool>.Failure("La fonction Chef de Groupe ne peut pas être restreinte.");

        // The caller can only grant what they themselves hold (no privilege escalation).
        var callerPerms = currentUser.Permissions.ToHashSet();
        var isSuper = currentUser.IsSuperAdmin;

        var profile = role.SecurityProfile;
        var currentPerms = profile.Permissions.Select(p => p.Permission).ToHashSet();

        // Fork a shared/system profile so editing this function doesn't affect the CG or other functions.
        var sharedByOthers = await context.FunctionalRoles.AnyAsync(r => r.SecurityProfileId == profile.Id && r.Id != role.Id && !r.IsDeleted, ct);
        SecurityProfile target;
        if (profile.IsSystem || sharedByOthers)
        {
            var baseCode = ContentText.Slugify(role.Name);
            if (string.IsNullOrWhiteSpace(baseCode)) baseCode = "maitrise-groupe";
            if (baseCode.Length > 45) baseCode = baseCode[..45];
            var code = baseCode;
            for (var i = 2; await context.SecurityProfiles.AnyAsync(sp => sp.Code == code, ct); i++) code = $"{baseCode}-{i}";

            target = new SecurityProfile { Name = role.Name, Code = code, Description = $"Accès de la fonction « {role.Name} »", IsSystem = false, IsGroupLevel = true };
            context.SecurityProfiles.Add(target);
            role.SecurityProfile = target;
            role.SecurityProfileId = target.Id;
        }
        else target = profile;

        // Start from the current permissions, apply the requested area levels.
        var newPerms = new HashSet<string>(currentPerms);
        foreach (var (key, level) in request.AreaLevels)
        {
            var area = GroupAccessAreas.All.FirstOrDefault(a => a.Key == key);
            if (area is not null) GroupAccessAreas.ApplyLevel(newPerms, area, level);
        }

        // Safety: never delegate meta/system perms, and (for a non-super caller) cap to what they hold.
        newPerms.ExceptWith(GroupAccessAreas.NonDelegatable);
        if (!isSuper) newPerms.IntersectWith(callerPerms);

        // Replace the target profile's permissions.
        context.SecurityProfilePermissions.RemoveRange(target.Permissions);
        target.Permissions.Clear();
        foreach (var p in newPerms)
            target.Permissions.Add(new SecurityProfilePermission { SecurityProfileId = target.Id, Permission = p });

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("SetGroupAccess", "FunctionalRole", role.Id,
            newValues: new { role.Name, Profile = target.Code, Permissions = newPerms.OrderBy(x => x).ToList() }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
