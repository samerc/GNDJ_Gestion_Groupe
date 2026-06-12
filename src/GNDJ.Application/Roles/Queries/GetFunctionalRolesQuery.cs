using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Roles.Queries;

public record FunctionalRoleDto(Guid Id, string Name, string Code, string? Description, Guid SecurityProfileId, string SecurityProfileName, Guid? UnitTypeId, string? UnitTypeName, string? UnitTypeColor, int AssignmentCount);

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
            .OrderBy(r => r.UnitTypeId == null ? 0 : 1).ThenBy(r => r.Name)
            .Select(r => new FunctionalRoleDto(
                r.Id, r.Name, r.Code, r.Description,
                r.SecurityProfileId, r.SecurityProfile.Name,
                r.UnitTypeId, r.UnitType != null ? r.UnitType.Name : null, r.UnitType != null ? r.UnitType.Color : null,
                r.Assignments.Count(a => !a.IsDeleted && a.EndDate == null)
            ))
            .ToListAsync(cancellationToken);
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

// Security profile detail (with permissions list)
public record SecurityProfileDetailDto(Guid Id, string Name, string Code, string? Description, bool IsSystem, IReadOnlyList<string> Permissions, int RoleCount);

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
                sp.FunctionalRoles.Count(r => !r.IsDeleted)
            ))
            .FirstOrDefaultAsync(ct);
    }
}

// Update security profile permissions
public record UpdateSecurityProfilePermissionsCommand(Guid Id, List<string> Permissions) : IRequest<Result<bool>>;

public class UpdateSecurityProfilePermissionsCommandHandler(IApplicationDbContext context, IAuditService auditService) : IRequestHandler<UpdateSecurityProfilePermissionsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateSecurityProfilePermissionsCommand request, CancellationToken ct)
    {
        var profile = await context.SecurityProfiles
            .Include(sp => sp.Permissions)
            .FirstOrDefaultAsync(sp => sp.Id == request.Id, ct);

        if (profile is null)
            return Result<bool>.Failure("Profil de sécurité introuvable.");

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
