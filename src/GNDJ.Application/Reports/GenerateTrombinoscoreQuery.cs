using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

public record GenerateTrombinoscoreQuery(
    Guid UnitId,
    string ScoutYear,
    bool IncludePhotos,
    List<Guid>? TeamIds // null = all teams
) : IRequest<Result<byte[]>>;

public class GenerateTrombinoscoreQueryHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    ITrombinoscoreService trombinoscoreService
) : IRequestHandler<GenerateTrombinoscoreQuery, Result<byte[]>>
{
    public async ValueTask<Result<byte[]>> Handle(GenerateTrombinoscoreQuery request, CancellationToken ct)
    {
        // Access check
        if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return Result<byte[]>.Failure("Accès non autorisé à cette unité.");

        var unit = await context.Units
            .Where(u => u.Id == request.UnitId)
            .Select(u => new { u.Name })
            .FirstOrDefaultAsync(ct);

        if (unit is null)
            return Result<byte[]>.Failure("Unité introuvable.");

        // Get active assignments grouped by team
        var query = context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null);

        var assignments = await query
            .OrderBy(a => a.Team != null ? a.Team.DisplayOrder : 999)
            .ThenByDescending(a => a.FunctionalRole.Rank)
            .ThenBy(a => a.Member.LastName)
            .ThenBy(a => a.Member.FirstName)
            .Select(a => new
            {
                a.Member.FirstName,
                a.Member.LastName,
                a.Member.CardNumber,
                a.Member.PhotoPath,
                TeamId = a.TeamId,
                TeamName = a.Team != null ? a.Team.Name : null,
                TeamOrder = a.Team != null ? a.Team.DisplayOrder : 999,
                IsMaitrise = a.Team != null ? a.Team.IsMaitrise : false,
            })
            .ToListAsync(ct);

        // Filter by team if specified
        if (request.TeamIds is { Count: > 0 })
            assignments = assignments.Where(a => a.TeamId.HasValue && request.TeamIds.Contains(a.TeamId.Value)).ToList();

        // Group by team
        var teams = assignments
            .GroupBy(a => new { a.TeamId, a.TeamName, a.TeamOrder, a.IsMaitrise })
            .OrderByDescending(g => g.Key.IsMaitrise).ThenBy(g => g.Key.TeamOrder)
            .Select(g => new TrombinoscoreTeam(
                g.Key.TeamName ?? "Sans équipe",
                g.Select(a => new TrombinoscoreMember(
                    $"{a.FirstName} {a.LastName}",
                    a.CardNumber,
                    a.PhotoPath
                )).ToList()
            ))
            .ToList();

        var data = new TrombinoscoreData(unit.Name, request.ScoutYear, request.IncludePhotos, teams);
        var pdf = trombinoscoreService.Generate(data);

        return Result<byte[]>.Success(pdf);
    }
}
