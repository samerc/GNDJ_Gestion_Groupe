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

public record PublicUnitGroupDto(Guid UnitTypeId, string UnitTypeName, string? Color, int? AgeMin, int? AgeMax,
    string? Description, string? AssociationCode, string? AssociationName, IReadOnlyList<PublicUnitListItemDto> Units);

public record PublicLeaderDto(string Name, string RoleName, string? Phone);
// Foulard colours (color1 = main, color2 = optional secondary) so the public page can render each team's scarf.
public record PublicTeamDto(string Name, int YouthCount, string? Color1, string? Color2);

public record PublicUnitDetailDto(string Slug, string Name, string UnitTypeName, string? Gender,
    int? AgeMin, int? AgeMax, string? PublicDescription, DateOnly? FoundedDate,
    IReadOnlyList<PublicLeaderDto> Leaders, IReadOnlyList<PublicTeamDto> Teams, int TotalYouth);

// ----- List (grouped by branch / unit type) -----
public record GetPublicUnitsQuery() : IRequest<IReadOnlyList<PublicUnitGroupDto>>;

public class GetPublicUnitsQueryHandler(IApplicationDbContext context)
    : IRequestHandler<GetPublicUnitsQuery, IReadOnlyList<PublicUnitGroupDto>>
{
    // Explicit parcours order of the branches (by unit-type code): youngest first, boys/girls paired.
    // Drives the public /unites ordering so it doesn't depend on the (often-null) AgeMin fields.
    private static readonly string[] BranchOrder =
        { "MEU", "RON", "TRO", "COM", "CLAN", "NOY", "JEM", "FEU", "CAR", "GRP" };

    private static int BranchRank(string? code)
    {
        var i = Array.IndexOf(BranchOrder, code);
        return i < 0 ? 999 : i; // unknown codes sort last
    }

    // Natural sort key: the first number in a unit name ("Meute 10ème Beyrouth" -> 10) so units
    // list 2, 3, 10 instead of the string order 10, 2, 3. No number -> 0 (sorts first).
    private static int UnitNumber(string name)
    {
        var m = System.Text.RegularExpressions.Regex.Match(name, @"\d+");
        return m.Success && int.TryParse(m.Value, out var n) ? n : 0;
    }

    public async ValueTask<IReadOnlyList<PublicUnitGroupDto>> Handle(GetPublicUnitsQuery request, CancellationToken ct)
    {
        var units = await context.Units
            .Where(u => u.IsPublished && u.Slug != null)
            .Select(u => new
            {
                u.Slug,
                u.Name,
                u.UnitTypeId,
                UnitTypeName = u.UnitType.Name,
                Code = u.UnitType.Code,
                u.UnitType.Gender,
                u.UnitType.AgeMin,
                u.UnitType.AgeMax,
                Color = u.UnitType.Color,
                Description = u.UnitType.PublicDescription,
                // Association (SDL/GDL) — held per unit; the public site splits branches by it. A branch's
                // published units all share one association in practice, so the group takes the first.
                AssocCode = u.Association != null ? u.Association.Code : null,
                AssocName = u.Association != null ? u.Association.Name : null,
                MemberCount = u.Assignments.Count(a => a.EndDate == null),
            })
            .ToListAsync(ct);

        return units
            .GroupBy(u => new { u.UnitTypeId, u.UnitTypeName, u.Code, u.Color, u.AgeMin, u.AgeMax, u.Description })
            // Branches in parcours order (then age, then name as a stable fallback)
            .OrderBy(g => BranchRank(g.Key.Code)).ThenBy(g => g.Key.AgeMin ?? 999).ThenBy(g => g.Key.UnitTypeName)
            .Select(g => new PublicUnitGroupDto(
                g.Key.UnitTypeId, g.Key.UnitTypeName, g.Key.Color, g.Key.AgeMin, g.Key.AgeMax, g.Key.Description,
                g.Select(u => u.AssocCode).FirstOrDefault(), g.Select(u => u.AssocName).FirstOrDefault(),
                // Units within a branch in natural numeric order (2, 3, 10)
                g.OrderBy(u => UnitNumber(u.Name)).ThenBy(u => u.Name)
                 .Select(u => new PublicUnitListItemDto(
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

        // Maîtrise (leaders): members on a leadership team, ordered by role rank. Public shows name + role +
        // the leader's OWN (personal) primary phone — a guardian's number is never used here. A leader with no
        // phone on file simply shows none (effectively opt-in).
        var leaderRows = await context.MemberAssignments
            .Where(a => a.UnitId == unit.Id && a.EndDate == null && a.Team != null && a.Team.IsMaitrise)
            .OrderByDescending(a => a.FunctionalRole.Rank)
            .ThenBy(a => a.Member.LastName).ThenBy(a => a.Member.FirstName)
            .Select(a => new { a.MemberId, Name = a.Member.FirstName + " " + a.Member.LastName, Role = a.FunctionalRole.Name })
            .ToListAsync(ct);
        var leaderIds = leaderRows.Select(r => r.MemberId).ToList();
        var leaderPhones = (await context.MemberPhones
            .Where(p => leaderIds.Contains(p.MemberId) && !p.IsDeleted)
            .Select(p => new { p.MemberId, p.CountryCode, p.Number, p.IsPrimary }).ToListAsync(ct))
            .GroupBy(p => p.MemberId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.IsPrimary).First());
        string? LeaderPhone(Guid mid) => leaderPhones.TryGetValue(mid, out var p)
            ? (string.IsNullOrWhiteSpace(p.CountryCode) ? p.Number?.Trim() : $"{p.CountryCode} {p.Number}".Trim())
            : null;
        // A member holding several functions in the same unit (e.g. Assistant de Groupe + Trésorier) has
        // multiple assignment rows → collapse to ONE entry that lists ALL their roles, senior first.
        // leaderRows is ordered by rank desc, so GroupBy keeps groups in senior-first order AND each group's
        // roles stay senior-first; the group's highest rank drives its position in the list.
        var leaders = leaderRows
            .GroupBy(r => r.MemberId)
            .Select(g => new PublicLeaderDto(
                g.First().Name,
                string.Join(" · ", g.Select(x => x.Role).Distinct()),
                LeaderPhone(g.Key)))
            .ToList();

        // Teams (non-leadership): name + active youth count only.
        var teams = await context.Teams
            .Where(t => t.UnitId == unit.Id && !t.IsMaitrise)
            .OrderBy(t => t.DisplayOrder).ThenBy(t => t.Name)
            .Select(t => new PublicTeamDto(t.Name, t.Assignments.Count(a => a.EndDate == null), t.Color1, t.Color2))
            .ToListAsync(ct);

        var totalYouth = await context.MemberAssignments
            .CountAsync(a => a.UnitId == unit.Id && a.EndDate == null && (a.Team == null || !a.Team.IsMaitrise), ct);

        return new PublicUnitDetailDto(unit.Slug!, unit.Name, unit.UnitTypeName, unit.Gender,
            unit.AgeMin, unit.AgeMax, unit.PublicDescription, unit.FoundedDate, leaders, teams, totalYouth);
    }
}
