using GNDJ.Application.Common.Interfaces;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Dashboard;

// Unit leader dashboard
public record UnitDashboardDto(
    Guid UnitId,
    string UnitName,
    string UnitTypeName,
    int TotalMembers,
    int TotalTeams,
    IReadOnlyList<TeamRosterDto> Teams,
    IReadOnlyList<RosterMemberDto> UnassignedMembers // members in unit but no team
);

public record TeamRosterDto(
    Guid TeamId,
    string TeamName,
    string? Totem,
    string? Color1,
    string? Color2,
    IReadOnlyList<RosterMemberDto> Members
);

public record RosterMemberDto(
    Guid MemberId,
    string FirstName,
    string LastName,
    string? CardNumber,
    string FunctionalRoleName,
    string? PrimaryPhone,
    string? PrimaryEmail,
    DateOnly? DateOfBirth
);

public record GetUnitDashboardQuery(Guid UnitId) : IRequest<UnitDashboardDto?>;

public class GetUnitDashboardQueryHandler : IRequestHandler<GetUnitDashboardQuery, UnitDashboardDto?>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetUnitDashboardQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<UnitDashboardDto?> Handle(GetUnitDashboardQuery request, CancellationToken cancellationToken)
    {
        // Access check
        if (!_currentUser.IsSuperAdmin && !_currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return null;

        var unit = await _context.Units
            .Where(u => u.Id == request.UnitId)
            .Select(u => new { u.Id, u.Name, UnitTypeName = u.UnitType.Name })
            .FirstOrDefaultAsync(cancellationToken);

        if (unit is null) return null;

        // Active assignments in this unit
        var assignments = await _context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null && !a.IsDeleted)
            .Select(a => new
            {
                a.MemberId,
                a.Member.FirstName,
                a.Member.LastName,
                a.Member.CardNumber,
                a.Member.DateOfBirth,
                a.TeamId,
                TeamName = a.Team != null ? a.Team.Name : null,
                TeamTotem = a.Team != null ? a.Team.Totem : null,
                TeamColor1 = a.Team != null ? a.Team.Color1 : null,
                TeamColor2 = a.Team != null ? a.Team.Color2 : null,
                TeamDisplayOrder = a.Team != null ? a.Team.DisplayOrder : 999,
                RoleName = a.FunctionalRole.Name,
                PrimaryPhone = a.Member.Phones.Where(p => p.IsPrimary && !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault(),
                PrimaryEmail = a.Member.Emails.Where(e => e.IsPrimary && !e.IsDeleted).Select(e => e.Address).FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);

        // Group by team
        var teamGroups = assignments
            .Where(a => a.TeamId != null)
            .GroupBy(a => new { a.TeamId, a.TeamName, a.TeamTotem, a.TeamColor1, a.TeamColor2, a.TeamDisplayOrder })
            .OrderBy(g => g.Key.TeamDisplayOrder)
            .Select(g => new TeamRosterDto(
                g.Key.TeamId!.Value,
                g.Key.TeamName!,
                g.Key.TeamTotem,
                g.Key.TeamColor1,
                g.Key.TeamColor2,
                g.Select(a => new RosterMemberDto(a.MemberId, a.FirstName, a.LastName, a.CardNumber, a.RoleName, a.PrimaryPhone, a.PrimaryEmail, a.DateOfBirth))
                    .OrderBy(m => m.LastName).ThenBy(m => m.FirstName).ToList()
            ))
            .ToList();

        var unassigned = assignments
            .Where(a => a.TeamId == null)
            .Select(a => new RosterMemberDto(a.MemberId, a.FirstName, a.LastName, a.CardNumber, a.RoleName, a.PrimaryPhone, a.PrimaryEmail, a.DateOfBirth))
            .OrderBy(m => m.LastName).ThenBy(m => m.FirstName)
            .ToList();

        var teams = await _context.Teams.CountAsync(t => t.UnitId == request.UnitId && !t.IsDeleted, cancellationToken);

        return new UnitDashboardDto(
            unit.Id, unit.Name, unit.UnitTypeName,
            assignments.Count, teams,
            teamGroups, unassigned
        );
    }
}

// Summary for super admin / overview
public record AdminDashboardDto(
    int TotalMembers,
    int TotalUnits,
    int TotalTeams,
    int ActiveAssignments,
    IReadOnlyList<UnitSummaryDto> Units
);

public record UnitSummaryDto(Guid Id, string Name, string UnitTypeName, int MemberCount, int TeamCount, bool IsActive);

public record GetAdminDashboardQuery : IRequest<AdminDashboardDto>;

public class GetAdminDashboardQueryHandler : IRequestHandler<GetAdminDashboardQuery, AdminDashboardDto>
{
    private readonly IApplicationDbContext _context;

    public GetAdminDashboardQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<AdminDashboardDto> Handle(GetAdminDashboardQuery request, CancellationToken cancellationToken)
    {
        var totalMembers = await _context.Members.CountAsync(cancellationToken);
        var totalUnits = await _context.Units.CountAsync(u => u.IsActive, cancellationToken);
        var totalTeams = await _context.Teams.CountAsync(cancellationToken);
        var activeAssignments = await _context.MemberAssignments.CountAsync(a => a.EndDate == null, cancellationToken);

        var units = await _context.Units
            .OrderBy(u => u.Name)
            .Select(u => new UnitSummaryDto(
                u.Id, u.Name, u.UnitType.Name,
                u.Assignments.Count(a => !a.IsDeleted && a.EndDate == null),
                u.Teams.Count(t => !t.IsDeleted),
                u.IsActive
            ))
            .ToListAsync(cancellationToken);

        return new AdminDashboardDto(totalMembers, totalUnits, totalTeams, activeAssignments, units);
    }
}
