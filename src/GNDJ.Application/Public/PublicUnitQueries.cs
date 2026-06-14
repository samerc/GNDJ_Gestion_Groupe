using GNDJ.Application.Common.Interfaces;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Public;

// ----- Public, anonymous, PII-free projections for the public website -----
// Hard rule: these endpoints expose ONLY whitelisted public fields. Never member contact info,
// medical data, addresses, card numbers, or youth names — leaders show name + role only,
// teams show name + a youth COUNT.

public record PublicUnitListItemDto(string Slug, string Name, string UnitTypeName, string? Gender,
    int? AgeMin, int? AgeMax, int MemberCount);

public record PublicUnitGroupDto(string UnitTypeName, string? Color, int? AgeMin, int? AgeMax,
    string? Description, IReadOnlyList<PublicUnitListItemDto> Units);

public record PublicLeaderDto(string Name, string RoleName);
public record PublicTeamDto(string Name, int YouthCount);

public record PublicUnitDetailDto(string Slug, string Name, string UnitTypeName, string? Gender,
    int? AgeMin, int? AgeMax, string? PublicDescription, DateOnly? FoundedDate,
    IReadOnlyList<PublicLeaderDto> Leaders, IReadOnlyList<PublicTeamDto> Teams, int TotalYouth);

// ----- List (grouped by branch / unit type) -----
public record GetPublicUnitsQuery() : IRequest<IReadOnlyList<PublicUnitGroupDto>>;

public class GetPublicUnitsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetPublicUnitsQuery, IReadOnlyList<PublicUnitGroupDto>>
{
    public async ValueTask<IReadOnlyList<PublicUnitGroupDto>> Handle(GetPublicUnitsQuery request, CancellationToken ct)
    {
        var units = await context.Units
            .Where(u => u.IsPublished && u.Slug != null)
            .OrderBy(u => u.UnitType.AgeMin).ThenBy(u => u.Name)
            .Select(u => new
            {
                u.Slug,
                u.Name,
                UnitTypeName = u.UnitType.Name,
                u.UnitType.Gender,
                u.UnitType.AgeMin,
                u.UnitType.AgeMax,
                Color = u.UnitType.Color,
                Description = u.UnitType.PublicDescription,
                MemberCount = u.Assignments.Count(a => a.EndDate == null),
            })
            .ToListAsync(ct);

        return units
            .GroupBy(u => new { u.UnitTypeName, u.Color, u.AgeMin, u.AgeMax, u.Description })
            .OrderBy(g => g.Key.AgeMin ?? 999).ThenBy(g => g.Key.UnitTypeName)
            .Select(g => new PublicUnitGroupDto(
                g.Key.UnitTypeName, g.Key.Color, g.Key.AgeMin, g.Key.AgeMax, g.Key.Description,
                g.Select(u => new PublicUnitListItemDto(
                    u.Slug!, u.Name, u.UnitTypeName, u.Gender, u.AgeMin, u.AgeMax, u.MemberCount
                )).ToList()))
            .ToList();
    }
}

// ----- Detail (by slug) -----
public record GetPublicUnitDetailQuery(string Slug) : IRequest<PublicUnitDetailDto?>;

public class GetPublicUnitDetailQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetPublicUnitDetailQuery, PublicUnitDetailDto?>
{
    public async ValueTask<PublicUnitDetailDto?> Handle(GetPublicUnitDetailQuery request, CancellationToken ct)
    {
        var slug = request.Slug.Trim().ToLowerInvariant();

        var unit = await context.Units
            .Where(u => u.Slug == slug && u.IsPublished)
            .Select(u => new
            {
                u.Id, u.Slug, u.Name,
                UnitTypeName = u.UnitType.Name,
                u.UnitType.Gender, u.UnitType.AgeMin, u.UnitType.AgeMax,
                PublicDescription = u.UnitType.PublicDescription,
                u.FoundedDate,
            })
            .FirstOrDefaultAsync(ct);

        if (unit is null) return null;

        // Maîtrise (leaders): members on a leadership team, name + role only, ordered by role rank.
        var leaders = await context.MemberAssignments
            .Where(a => a.UnitId == unit.Id && a.EndDate == null && a.Team != null && a.Team.IsMaitrise)
            .OrderByDescending(a => a.FunctionalRole.Rank)
            .ThenBy(a => a.Member.LastName).ThenBy(a => a.Member.FirstName)
            .Select(a => new PublicLeaderDto(a.Member.FirstName + " " + a.Member.LastName, a.FunctionalRole.Name))
            .ToListAsync(ct);

        // Teams (non-leadership): name + active youth count only.
        var teams = await context.Teams
            .Where(t => t.UnitId == unit.Id && !t.IsMaitrise)
            .OrderBy(t => t.DisplayOrder).ThenBy(t => t.Name)
            .Select(t => new PublicTeamDto(t.Name, t.Assignments.Count(a => a.EndDate == null)))
            .ToListAsync(ct);

        var totalYouth = await context.MemberAssignments
            .CountAsync(a => a.UnitId == unit.Id && a.EndDate == null && (a.Team == null || !a.Team.IsMaitrise), ct);

        return new PublicUnitDetailDto(unit.Slug!, unit.Name, unit.UnitTypeName, unit.Gender,
            unit.AgeMin, unit.AgeMax, unit.PublicDescription, unit.FoundedDate, leaders, teams, totalYouth);
    }
}
