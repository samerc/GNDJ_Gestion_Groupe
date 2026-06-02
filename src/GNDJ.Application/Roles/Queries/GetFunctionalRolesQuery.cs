using GNDJ.Application.Common.Interfaces;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Roles.Queries;

public record FunctionalRoleDto(Guid Id, string Name, string Code, string? Description, Guid SecurityProfileId, string SecurityProfileName, Guid? UnitTypeId, string? UnitTypeName, int AssignmentCount);

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
                r.UnitTypeId, r.UnitType != null ? r.UnitType.Name : null,
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
