using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Roles.Queries;

public record FunctionalRoleDto(Guid Id, string Name, string Code, string? Description, Guid SecurityProfileId, string SecurityProfileName, Guid? UnitTypeId, string? UnitTypeName, string? UnitTypeColor, int Rank, int AssignmentCount, bool UsedByMembers, bool IsArchived, bool IsDefaultForNewMembers, bool IsMaitrise, bool IsTeamLeader);

public record GetFunctionalRolesQuery(Guid? UnitTypeId = null) : IRequest<IReadOnlyList<FunctionalRoleDto>>;

public class GetFunctionalRolesQueryHandler : IRequestHandler<GetFunctionalRolesQuery, IReadOnlyList<FunctionalRoleDto>>
{
    private readonly IApplicationDbContext _context;

    public GetFunctionalRolesQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<IReadOnlyList<FunctionalRoleDto>> Handle(GetFunctionalRolesQuery request, CancellationToken cancellationToken)
    {
        var query = _context.FunctionalRoles.AsQueryable();

        if (request.UnitTypeId.HasValue)
            query = query.Where(r => r.UnitTypeId == request.UnitTypeId.Value || r.UnitTypeId == null);

        return await query
            // Most senior first (rank desc); globals before type-specific; name as final tiebreak.
            .OrderBy(r => r.UnitTypeId == null ? 0 : 1).ThenByDescending(r => r.Rank).ThenBy(r => r.Name)
            .Select(r => new FunctionalRoleDto(
                r.Id, r.Name, r.Code, r.Description,
                r.SecurityProfileId, r.SecurityProfile.Name,
                r.UnitTypeId, r.UnitType != null ? r.UnitType.Name : null, r.UnitType != null ? r.UnitType.Color : null,
                r.Rank,
                r.Assignments.Count(a => !a.IsDeleted && a.EndDate == null),
                r.Assignments.Any(a => !a.IsDeleted),
                r.IsArchived,
                r.IsDefaultForNewMembers,
                r.IsMaitrise,
                r.IsTeamLeader
            ))
            .ToListAsync(cancellationToken);
    }
}

// Members who hold a given functional role (for the "this function is used by…" delete popup).
public record FunctionMemberDto(Guid MemberId, string FirstName, string LastName, string? UnitCode, bool Active);

public record GetFunctionalRoleMembersQuery(Guid RoleId) : IRequest<IReadOnlyList<FunctionMemberDto>>;

public class GetFunctionalRoleMembersQueryHandler(IApplicationDbContext context) : IRequestHandler<GetFunctionalRoleMembersQuery, IReadOnlyList<FunctionMemberDto>>
{
    public async ValueTask<IReadOnlyList<FunctionMemberDto>> Handle(GetFunctionalRoleMembersQuery request, CancellationToken ct)
    {
        var rows = await context.MemberAssignments
            .Where(a => a.FunctionalRoleId == request.RoleId)
            .Select(a => new { a.MemberId, a.Member.FirstName, a.Member.LastName, UnitCode = a.Unit.Code, Active = a.EndDate == null })
            .ToListAsync(ct);

        return rows
            .GroupBy(r => r.MemberId)
            .Select(g => g.OrderByDescending(x => x.Active).First()) // one row per member, prefer active
            .Select(g => new FunctionMemberDto(g.MemberId, g.FirstName, g.LastName, g.UnitCode, g.Active))
            .OrderByDescending(m => m.Active).ThenBy(m => m.LastName).ThenBy(m => m.FirstName)
            .ToList();
    }
}

// Security profiles list (for dropdowns)
public record SecurityProfileDto(Guid Id, string Name, string Code, bool IsSystem);

public record GetSecurityProfilesQuery : IRequest<IReadOnlyList<SecurityProfileDto>>;

public class GetSecurityProfilesQueryHandler : IRequestHandler<GetSecurityProfilesQuery, IReadOnlyList<SecurityProfileDto>>
{
    private readonly IApplicationDbContext _context;

    public GetSecurityProfilesQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<IReadOnlyList<SecurityProfileDto>> Handle(GetSecurityProfilesQuery request, CancellationToken cancellationToken)
    {
        return await _context.SecurityProfiles
            .OrderBy(sp => sp.Name)
            .Select(sp => new SecurityProfileDto(sp.Id, sp.Name, sp.Code, sp.IsSystem))
            .ToListAsync(cancellationToken);
    }
}

// Security profile detail (with permissions list + the names of the fonctions that use it, for the relift/merge UI)
public record SecurityProfileDetailDto(Guid Id, string Name, string Code, string? Description, bool IsSystem, IReadOnlyList<string> Permissions, int RoleCount, IReadOnlyList<string> RoleNames);

public record GetSecurityProfileByIdQuery(Guid Id) : IRequest<SecurityProfileDetailDto?>;

public class GetSecurityProfileByIdQueryHandler(IApplicationDbContext context) : IRequestHandler<GetSecurityProfileByIdQuery, SecurityProfileDetailDto?>
{
    public async ValueTask<SecurityProfileDetailDto?> Handle(GetSecurityProfileByIdQuery request, CancellationToken ct)
    {
        return await context.SecurityProfiles
            .Where(sp => sp.Id == request.Id)
            .Select(sp => new SecurityProfileDetailDto(
                sp.Id, sp.Name, sp.Code, sp.Description, sp.IsSystem,
                sp.Permissions.Select(p => p.Permission).OrderBy(p => p).ToList(),
                sp.FunctionalRoles.Count(r => !r.IsDeleted),
                // The fonctions bound to this profile (name + unit-type when set), so the editor shows WHO uses it,
                // not just a count — also drives the merge dialog ("N fonctions will move to the target").
                sp.FunctionalRoles.Where(r => !r.IsDeleted)
                    .OrderBy(r => r.Name)
                    .Select(r => r.UnitType != null ? r.Name + " (" + r.UnitType.Name + ")" : r.Name)
                    .ToList()
            ))
            .FirstOrDefaultAsync(ct);
    }
}

// Members who hold a given security profile (via their active assignment's function). For the
// super-admin profile, also list the flagged super-admin accounts (those have the flag, not a role).
public record ProfileMemberDto(Guid MemberId, string FirstName, string LastName, string? UnitCode, string? FunctionName, int Rank, bool IsAccountFlag);

public record GetSecurityProfileMembersQuery(Guid ProfileId) : IRequest<IReadOnlyList<ProfileMemberDto>>;

public class GetSecurityProfileMembersQueryHandler(IApplicationDbContext context) : IRequestHandler<GetSecurityProfileMembersQuery, IReadOnlyList<ProfileMemberDto>>
{
    public async ValueTask<IReadOnlyList<ProfileMemberDto>> Handle(GetSecurityProfileMembersQuery request, CancellationToken ct)
    {
        var code = await context.SecurityProfiles.Where(sp => sp.Id == request.ProfileId).Select(sp => sp.Code).FirstOrDefaultAsync(ct);

        var members = await context.MemberAssignments
            .Where(a => a.EndDate == null && a.FunctionalRole.SecurityProfileId == request.ProfileId)
            .Select(a => new ProfileMemberDto(a.MemberId, a.Member.FirstName, a.Member.LastName,
                a.Unit.Code, a.FunctionalRole.Name, a.FunctionalRole.Rank, false))
            .ToListAsync(ct);

        if (code == "super-admin")
        {
            var admins = await context.Users.Where(u => u.IsSuperAdmin)
                .Select(u => new ProfileMemberDto(u.MemberId, u.Member.FirstName, u.Member.LastName, null, "Super administrateur (compte)", 0, true))
                .ToListAsync(ct);
            members = members.Concat(admins).DistinctBy(m => new { m.MemberId, m.UnitCode, m.FunctionName }).ToList();
        }

        return members.OrderBy(m => m.LastName).ThenBy(m => m.FirstName).ToList();
    }
}

// Update security profile permissions
public record UpdateSecurityProfilePermissionsCommand(Guid Id, List<string> Permissions) : IRequest<Result<bool>>;

public class UpdateSecurityProfilePermissionsCommandValidator : AbstractValidator<UpdateSecurityProfilePermissionsCommand>
{
    public UpdateSecurityProfilePermissionsCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Permissions).NotNull().Must(p => p.Count <= 500).WithMessage("Trop de permissions.");
    }
}

public class UpdateSecurityProfilePermissionsCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<UpdateSecurityProfilePermissionsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateSecurityProfilePermissionsCommand request, CancellationToken ct)
    {
        var profile = await context.SecurityProfiles
            .Include(sp => sp.Permissions)
            .FirstOrDefaultAsync(sp => sp.Id == request.Id, ct);

        if (profile is null)
            return Result<bool>.Failure("Profil de sécurité introuvable.");

        // Reject any permission string that isn't a known permission (prevents garbage/escalation strings).
        var known = GNDJ.Domain.Enums.Permissions.All.ToHashSet();
        var invalid = request.Permissions.Where(p => !known.Contains(p)).Distinct().ToList();
        if (invalid.Count > 0)
            return Result<bool>.Failure($"Permission(s) inconnue(s) : {string.Join(", ", invalid)}.");

        var oldPerms = profile.Permissions.Select(p => p.Permission).OrderBy(p => p).ToList();

        // Remove all existing permissions
        context.SecurityProfilePermissions.RemoveRange(profile.Permissions);

        // Add the new set
        foreach (var perm in request.Permissions.Distinct())
        {
            context.SecurityProfilePermissions.Add(new Domain.Entities.SecurityProfilePermission
            {
                SecurityProfileId = profile.Id,
                Permission = perm
            });
        }

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Update", "SecurityProfile", profile.Id,
            oldValues: new { Permissions = oldPerms },
            newValues: new { Permissions = request.Permissions.OrderBy(p => p).ToList() },
            cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
