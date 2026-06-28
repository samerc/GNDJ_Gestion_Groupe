using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Units.DTOs;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Units.Queries;

// Paginated unit list with search (name/code) + association/unit-type/active filters. Results are
// unit-scoped: non-super-admins only see their authorized units.
public record GetUnitsQuery(
    string? Search,
    Guid? AssociationId,
    Guid? UnitTypeId,
    bool? IsActive,
    int Page = 1,
    int PageSize = 20
) : IRequest<PaginatedList<UnitDto>>;

public class GetUnitsQueryHandler : IRequestHandler<GetUnitsQuery, PaginatedList<UnitDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetUnitsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<PaginatedList<UnitDto>> Handle(GetUnitsQuery request, CancellationToken cancellationToken)
    {
        var query = _context.Units
            .Include(u => u.Association)
            .Include(u => u.UnitType)
            .AsQueryable();

        // Unit-scoped access (unless super admin)
        if (!_currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
            query = query.Where(u => authorizedUnitIds.Contains(u.Id));
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.ToLower();
            query = query.Where(u => u.Name.ToLower().Contains(search) || u.Code.ToLower().Contains(search));
        }

        if (request.AssociationId.HasValue)
            query = query.Where(u => u.AssociationId == request.AssociationId.Value);

        if (request.UnitTypeId.HasValue)
            query = query.Where(u => u.UnitTypeId == request.UnitTypeId.Value);

        if (request.IsActive.HasValue)
            query = query.Where(u => u.IsActive == request.IsActive.Value);

        var projected = query.OrderBy(u => u.Name).Select(u => new UnitDto(
            u.Id, u.Name, u.Code, u.Description, u.IsActive,
            u.AssociationId, u.Association != null ? u.Association.Name : null,
            u.UnitTypeId, u.UnitType.Name,
            u.Teams.Count(t => !t.IsDeleted),
            u.Assignments.Count(a => !a.IsDeleted && a.EndDate == null),
            u.Slug, u.IsPublished, u.FoundedDate
        ));

        return await PaginatedList<UnitDto>.CreateAsync(projected, request.Page, request.PageSize, cancellationToken);
    }
}

// Single unit detail; returns null if not found OR the caller isn't authorized for that unit.
public record GetUnitByIdQuery(Guid Id) : IRequest<UnitDetailDto?>;

public class GetUnitByIdQueryHandler : IRequestHandler<GetUnitByIdQuery, UnitDetailDto?>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetUnitByIdQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<UnitDetailDto?> Handle(GetUnitByIdQuery request, CancellationToken cancellationToken)
    {
        if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(request.Id))
            return null;

        return await _context.Units
            .Where(u => u.Id == request.Id)
            .Select(u => new UnitDetailDto(
                u.Id, u.Name, u.Code, u.Description, u.IsActive,
                u.AssociationId, u.Association != null ? u.Association.Name : null,
                u.UnitTypeId, u.UnitType.Name,
                u.Teams.Count(t => !t.IsDeleted),
                u.Assignments.Count(a => !a.IsDeleted && a.EndDate == null),
                u.CreatedAt, u.UpdatedAt,
                u.Slug, u.IsPublished, u.FoundedDate
            ))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
