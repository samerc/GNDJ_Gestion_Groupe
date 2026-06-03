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
    int Boys,
    int Girls,
    int MembersWithoutUnit,
    int UnpaidCotisations,
    int MissingDocuments,
    IReadOnlyList<UnitBreakdownDto> UnitBreakdown,
    IReadOnlyList<AgeGroupDto> AgeGroups
);

public record UnitBreakdownDto(string UnitCode, string UnitName, int MemberCount, int DocCompliance);
public record AgeGroupDto(string Label, int Count);

public record GetAdminDashboardQuery(string SchoolYear) : IRequest<AdminDashboardDto>;

public class GetAdminDashboardQueryHandler : IRequestHandler<GetAdminDashboardQuery, AdminDashboardDto>
{
    private readonly IApplicationDbContext _context;

    public GetAdminDashboardQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<AdminDashboardDto> Handle(GetAdminDashboardQuery request, CancellationToken cancellationToken)
    {
        var ct = cancellationToken;

        // All members
        var members = await _context.Members
            .Select(m => new { m.Id, m.Gender, m.DateOfBirth, HasActiveAssignment = m.Assignments.Any(a => a.EndDate == null) })
            .ToListAsync(ct);

        var totalMembers = members.Count;
        var boys = members.Count(m => m.Gender == "Masculin");
        var girls = members.Count(m => m.Gender == "Féminin");
        var withoutUnit = members.Count(m => !m.HasActiveAssignment);

        // Active member IDs (have current assignment)
        var activeMemberIds = members.Where(m => m.HasActiveAssignment).Select(m => m.Id).ToHashSet();

        // Unpaid cotisations
        var paidMemberIds = await _context.MemberCotisations
            .Where(c => c.SchoolYear == request.SchoolYear)
            .Select(c => c.MemberId)
            .ToListAsync(ct);
        var unpaidCotisations = activeMemberIds.Count(id => !paidMemberIds.Contains(id));

        // Missing documents: active members who are missing at least one active doc type
        var activeDocTypeCount = await _context.DocumentTypes.CountAsync(dt => dt.IsActive, ct);
        var membersWithAllDocs = 0;
        if (activeDocTypeCount > 0)
        {
            var memberDocCounts = await _context.MemberDocuments
                .Where(d => activeMemberIds.Contains(d.MemberId) && d.DocumentType.IsActive)
                .GroupBy(d => d.MemberId)
                .Select(g => new { MemberId = g.Key, Count = g.Select(d => d.DocumentTypeId).Distinct().Count() })
                .ToListAsync(ct);
            membersWithAllDocs = memberDocCounts.Count(m => m.Count >= activeDocTypeCount);
        }
        var missingDocuments = activeMemberIds.Count - membersWithAllDocs;

        // Unit breakdown with doc compliance
        var units = await _context.Units
            .Where(u => u.IsActive)
            .OrderBy(u => u.Name)
            .Select(u => new
            {
                u.Code, u.Name,
                MemberCount = u.Assignments.Count(a => a.EndDate == null),
                MemberIds = u.Assignments.Where(a => a.EndDate == null).Select(a => a.MemberId).ToList()
            })
            .ToListAsync(ct);

        var allUnitMemberIds = units.SelectMany(u => u.MemberIds).Distinct().ToList();
        var docCountsByMember = await _context.MemberDocuments
            .Where(d => allUnitMemberIds.Contains(d.MemberId) && d.DocumentType.IsActive)
            .GroupBy(d => d.MemberId)
            .Select(g => new { MemberId = g.Key, TypeCount = g.Select(d => d.DocumentTypeId).Distinct().Count() })
            .ToDictionaryAsync(g => g.MemberId, g => g.TypeCount, ct);

        var unitBreakdown = units.Select(u =>
        {
            var compliant = activeDocTypeCount > 0
                ? u.MemberIds.Count(mid => docCountsByMember.GetValueOrDefault(mid, 0) >= activeDocTypeCount)
                : u.MemberCount;
            var pct = u.MemberCount > 0 ? (int)Math.Round(100.0 * compliant / u.MemberCount) : 100;
            return new UnitBreakdownDto(u.Code, u.Name, u.MemberCount, pct);
        }).ToList();

        // Age groups
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var ageGroups = new List<AgeGroupDto>();
        var withDob = members.Where(m => m.DateOfBirth.HasValue && m.HasActiveAssignment).ToList();
        var ages = withDob.Select(m => today.Year - m.DateOfBirth!.Value.Year - (today.DayOfYear < m.DateOfBirth.Value.DayOfYear ? 1 : 0)).ToList();
        ageGroups.Add(new AgeGroupDto("7-10 ans", ages.Count(a => a >= 7 && a <= 10)));
        ageGroups.Add(new AgeGroupDto("11-14 ans", ages.Count(a => a >= 11 && a <= 14)));
        ageGroups.Add(new AgeGroupDto("15-17 ans", ages.Count(a => a >= 15 && a <= 17)));
        ageGroups.Add(new AgeGroupDto("18-21 ans", ages.Count(a => a >= 18 && a <= 21)));
        ageGroups.Add(new AgeGroupDto("22+ ans", ages.Count(a => a >= 22)));

        return new AdminDashboardDto(totalMembers, boys, girls, withoutUnit, unpaidCotisations, missingDocuments, unitBreakdown, ageGroups);
    }
}
