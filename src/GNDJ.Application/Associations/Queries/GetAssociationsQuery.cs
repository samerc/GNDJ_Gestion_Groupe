using GNDJ.Application.Associations.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Associations.Queries;

// Both queries are gated at the controller by associations.view; no unit scoping (associations are group-wide).
// Paginated, searchable (name/code) list of associations for the admin org-structure page.
public record GetAssociationsQuery(string? Search, int Page = 1, int PageSize = 20) : IRequest<PaginatedList<AssociationDto>>;

public class GetAssociationsQueryHandler : IRequestHandler<GetAssociationsQuery, PaginatedList<AssociationDto>>
{
    private readonly IApplicationDbContext _context;

    public GetAssociationsQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<PaginatedList<AssociationDto>> Handle(GetAssociationsQuery request, CancellationToken cancellationToken)
    {
        var query = _context.Associations.AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.ToLower();
            query = query.Where(a => a.Name.ToLower().Contains(search) || a.Code.ToLower().Contains(search));
        }

        var projected = query.OrderBy(a => a.Name).Select(a => new AssociationDto(
            a.Id, a.Name, a.Code, a.Description,
            // Explicit !IsDeleted: the count runs inside the projection, so the soft-delete filter is spelled out here.
            a.Units.Count(u => !u.IsDeleted),
            a.CreatedAt
        ));

        return await PaginatedList<AssociationDto>.CreateAsync(projected, request.Page, request.PageSize, cancellationToken);
    }
}

// Single association by id (edit view); null when not found.
public record GetAssociationByIdQuery(Guid Id) : IRequest<AssociationDetailDto?>;

public class GetAssociationByIdQueryHandler : IRequestHandler<GetAssociationByIdQuery, AssociationDetailDto?>
{
    private readonly IApplicationDbContext _context;

    public GetAssociationByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<AssociationDetailDto?> Handle(GetAssociationByIdQuery request, CancellationToken cancellationToken)
    {
        return await _context.Associations
            .Where(a => a.Id == request.Id)
            .Select(a => new AssociationDetailDto(a.Id, a.Name, a.Code, a.Description, a.CreatedAt, a.UpdatedAt))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
