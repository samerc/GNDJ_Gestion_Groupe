using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.UnitTypes.DTOs;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.UnitTypes.Queries;

public record GetUnitTypesQuery(string? Search, int Page = 1, int PageSize = 20) : IRequest<PaginatedList<UnitTypeDto>>;

public class GetUnitTypesQueryHandler : IRequestHandler<GetUnitTypesQuery, PaginatedList<UnitTypeDto>>
{
    private readonly IApplicationDbContext _context;

    public GetUnitTypesQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<PaginatedList<UnitTypeDto>> Handle(GetUnitTypesQuery request, CancellationToken cancellationToken)
    {
        var query = _context.UnitTypes.AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.ToLower();
            query = query.Where(ut => ut.Name.ToLower().Contains(search) || ut.Code.ToLower().Contains(search));
        }

        var projected = query.OrderBy(ut => ut.Name).Select(ut => new UnitTypeDto(
            ut.Id, ut.Name, ut.Code, ut.Description, ut.NumberOfYears,
            ut.AgeMin, ut.AgeMax, ut.Color,
            ut.Units.Count(u => !u.IsDeleted),
            ut.CreatedAt
        ));

        return await PaginatedList<UnitTypeDto>.CreateAsync(projected, request.Page, request.PageSize, cancellationToken);
    }
}

public record GetUnitTypeByIdQuery(Guid Id) : IRequest<UnitTypeDetailDto?>;

public class GetUnitTypeByIdQueryHandler : IRequestHandler<GetUnitTypeByIdQuery, UnitTypeDetailDto?>
{
    private readonly IApplicationDbContext _context;

    public GetUnitTypeByIdQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<UnitTypeDetailDto?> Handle(GetUnitTypeByIdQuery request, CancellationToken cancellationToken)
    {
        return await _context.UnitTypes
            .Where(ut => ut.Id == request.Id)
            .Select(ut => new UnitTypeDetailDto(ut.Id, ut.Name, ut.Code, ut.Description, ut.NumberOfYears, ut.AgeMin, ut.AgeMax, ut.Color, ut.CreatedAt, ut.UpdatedAt))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
