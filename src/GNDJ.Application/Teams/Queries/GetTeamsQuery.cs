using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Teams.DTOs;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Teams.Queries;

public record GetTeamsQuery(Guid? UnitId, string? Search, int Page = 1, int PageSize = 20) : IRequest<PaginatedList<TeamDto>>;

public class GetTeamsQueryHandler : IRequestHandler<GetTeamsQuery, PaginatedList<TeamDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetTeamsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<PaginatedList<TeamDto>> Handle(GetTeamsQuery request, CancellationToken cancellationToken)
    {
        var query = _context.Teams
            .Include(t => t.Unit)
            .AsQueryable();

        if (!_currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
            query = query.Where(t => authorizedUnitIds.Contains(t.UnitId));
        }

        if (request.UnitId.HasValue)
            query = query.Where(t => t.UnitId == request.UnitId.Value);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.ToLower();
            query = query.Where(t => t.Name.ToLower().Contains(search) || (t.Totem != null && t.Totem.ToLower().Contains(search)));
        }

        var projected = query.OrderBy(t => t.Unit.Name).ThenBy(t => t.DisplayOrder).ThenBy(t => t.Name)
            .Select(t => new TeamDto(
                t.Id, t.Name, t.Description, t.Totem, t.Adjective, t.Color1, t.Color2,
                t.DisplayOrder, t.IsMaitrise, t.UnitId, t.Unit.Name,
                t.Assignments.Count(a => !a.IsDeleted && a.EndDate == null)
            ));

        return await PaginatedList<TeamDto>.CreateAsync(projected, request.Page, request.PageSize, cancellationToken);
    }
}
