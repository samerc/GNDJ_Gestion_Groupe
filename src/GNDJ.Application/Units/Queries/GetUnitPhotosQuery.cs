using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Units.Queries;

// « Photos des membres »: every active member of one unit with their photo state, grouped by team (maîtrise first),
// so a chef can see at a glance who has no photo and which photos look wrong (bad crop, sideways, …).
public record GetUnitPhotosQuery(Guid UnitId) : IRequest<UnitPhotosDto?>;

public record UnitPhotoMemberDto(Guid MemberId, string FirstName, string LastName, string? PhotoPath, string? RoleName, bool IsMaitrise);
public record UnitPhotoTeamDto(string Name, bool IsMaitrise, List<UnitPhotoMemberDto> Members);
public record UnitPhotosDto(Guid UnitId, string UnitName, string UnitCode, int MemberCount, int WithPhotoCount, List<UnitPhotoTeamDto> Teams);

// Access: a chef of that unit (members.edit + unit in scope) or a group manager (CG / ACG / super-admin) for any unit.
public class GetUnitPhotosQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUnitPhotosQuery, UnitPhotosDto?>
{
    public async ValueTask<UnitPhotosDto?> Handle(GetUnitPhotosQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser) && !MemberAccess.CanLeadUnit(currentUser, request.UnitId))
            throw new UnauthorizedAccessException("Accès non autorisé à cette unité.");

        var unit = await context.Units.Where(u => u.Id == request.UnitId)
            .Select(u => new { u.Id, u.Name, u.Code }).FirstOrDefaultAsync(ct);
        if (unit is null) return null;

        // Active posts in the unit (a member with two posts here is listed once — the most senior post wins).
        var rows = await context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null && !a.Member.IsDeleted)
            .Select(a => new
            {
                a.MemberId, a.Member.FirstName, a.Member.LastName, a.Member.PhotoPath,
                RoleName = a.FunctionalRole.Name, RoleRank = a.FunctionalRole.Rank, RoleMaitrise = a.FunctionalRole.IsMaitrise,
                TeamName = a.Team != null ? a.Team.Name : null,
                TeamOrder = a.Team != null ? a.Team.DisplayOrder : int.MaxValue,
                TeamMaitrise = a.Team != null && a.Team.IsMaitrise,
            })
            .ToListAsync(ct);

        var members = rows.GroupBy(r => r.MemberId).Select(g => g.OrderByDescending(r => r.RoleRank).First()).ToList();

        // Maîtrise first (its team, or any leader without a team), then teams in display order, « Sans équipe » last.
        var teams = members
            .GroupBy(r => r.TeamMaitrise || (r.TeamName is null && r.RoleMaitrise) ? "Maîtrise" : r.TeamName ?? "Sans équipe")
            .Select(g => new
            {
                Name = g.Key,
                IsMaitrise = g.Key == "Maîtrise" || g.Any(r => r.TeamMaitrise),
                Order = g.Min(r => r.TeamOrder),
                Members = g.OrderByDescending(r => r.RoleMaitrise).ThenByDescending(r => r.RoleRank)
                    .ThenBy(r => r.LastName).ThenBy(r => r.FirstName)
                    .Select(r => new UnitPhotoMemberDto(r.MemberId, r.FirstName, r.LastName, r.PhotoPath, r.RoleName, r.RoleMaitrise))
                    .ToList(),
            })
            .OrderByDescending(t => t.IsMaitrise).ThenBy(t => t.Name == "Sans équipe").ThenBy(t => t.Order).ThenBy(t => t.Name)
            .Select(t => new UnitPhotoTeamDto(t.Name, t.IsMaitrise, t.Members))
            .ToList();

        return new UnitPhotosDto(unit.Id, unit.Name, unit.Code, members.Count,
            members.Count(m => !string.IsNullOrEmpty(m.PhotoPath)), teams);
    }
}
