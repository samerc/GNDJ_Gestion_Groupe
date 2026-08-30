using GNDJ.Application.Common;
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
    IReadOnlyList<RosterMemberDto> UnassignedMembers, // members in unit but no team
    IReadOnlyList<UnitRosterGroupDto> Groups // rule-based member groups the CU can filter the roster by (ShowInUnitList)
);

// A member group applicable to this unit, with the ids of its members present in the unit's roster.
public record UnitRosterGroupDto(Guid Id, string Name, IReadOnlyList<Guid> MemberIds);

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
    int FunctionalRoleRank,
    string? PrimaryPhone,
    string? PrimaryEmail,
    DateOnly? DateOfBirth,
    string? PhotoPath
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
        // Access check: the unit-leader dashboard is a leader roster (co-members' contacts/photos), so it
        // requires members.edit + unit scope — not bare co-unit membership. A read-only youth carries their
        // own unit in AuthorizedUnitIds and would otherwise see the whole unit roster.
        if (!_currentUser.IsSuperAdmin && !(_currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit) && _currentUser.AuthorizedUnitIds.Contains(request.UnitId)))
            return null;

        var unit = await _context.Units
            .Where(u => u.Id == request.UnitId)
            .Select(u => new { u.Id, u.Name, u.UnitTypeId, UnitTypeName = u.UnitType.Name })
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
                a.Member.PhotoPath,
                a.TeamId,
                TeamName = a.Team != null ? a.Team.Name : null,
                TeamTotem = a.Team != null ? a.Team.Totem : null,
                TeamColor1 = a.Team != null ? a.Team.Color1 : null,
                TeamColor2 = a.Team != null ? a.Team.Color2 : null,
                TeamDisplayOrder = a.Team != null ? a.Team.DisplayOrder : 999,
                TeamIsMaitrise = a.Team != null ? a.Team.IsMaitrise : false,
                RoleName = a.FunctionalRole.Name,
                RoleRank = a.FunctionalRole.Rank,
                PrimaryPhone = a.Member.Phones.Where(p => p.IsPrimary && !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault(),
                PrimaryEmail = a.Member.Emails.Where(e => e.IsPrimary && !e.IsDeleted).Select(e => e.Address).FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);

        // Group by team
        var teamGroups = assignments
            .Where(a => a.TeamId != null)
            .GroupBy(a => new { a.TeamId, a.TeamName, a.TeamTotem, a.TeamColor1, a.TeamColor2, a.TeamDisplayOrder, a.TeamIsMaitrise })
            .OrderByDescending(g => g.Key.TeamIsMaitrise).ThenBy(g => g.Key.TeamDisplayOrder)
            .Select(g => new TeamRosterDto(
                g.Key.TeamId!.Value,
                g.Key.TeamName!,
                g.Key.TeamTotem,
                g.Key.TeamColor1,
                g.Key.TeamColor2,
                g.Select(a => new RosterMemberDto(a.MemberId, a.FirstName, a.LastName, a.CardNumber, a.RoleName, a.RoleRank, a.PrimaryPhone, a.PrimaryEmail, a.DateOfBirth, a.PhotoPath))
                    .OrderByDescending(m => m.FunctionalRoleRank).ThenBy(m => m.LastName).ThenBy(m => m.FirstName).ToList()
            ))
            .ToList();

        var unassigned = assignments
            .Where(a => a.TeamId == null)
            .Select(a => new RosterMemberDto(a.MemberId, a.FirstName, a.LastName, a.CardNumber, a.RoleName, a.RoleRank, a.PrimaryPhone, a.PrimaryEmail, a.DateOfBirth, a.PhotoPath))
            .OrderByDescending(m => m.FunctionalRoleRank).ThenBy(m => m.LastName).ThenBy(m => m.FirstName)
            .ToList();

        var teams = await _context.Teams.CountAsync(t => t.UnitId == request.UnitId && !t.IsDeleted, cancellationToken);

        // Rule-based member groups flagged ShowInUnitList that APPLY to this unit (whole-group, this branch, or
        // this exact unit). Each is resolved to the member ids present in THIS unit's roster, so the CU can filter
        // the list by the group. Never exposed publicly or to members — this is the leader roster only.
        var applicableGroups = await _context.MemberGroups
            .Include(g => g.Rules)
            .Where(g => g.ShowInUnitList
                && (g.ScopeType == GNDJ.Domain.Entities.MemberGroupScopes.Group
                    || (g.ScopeType == GNDJ.Domain.Entities.MemberGroupScopes.Unit && g.UnitId == request.UnitId)
                    || (g.ScopeType == GNDJ.Domain.Entities.MemberGroupScopes.UnitType && g.UnitTypeId == unit.UnitTypeId)))
            .OrderBy(g => g.Name)
            .ToListAsync(cancellationToken);

        var rosterGroups = new List<UnitRosterGroupDto>(applicableGroups.Count);
        foreach (var g in applicableGroups)
        {
            var memberIds = await MemberGroupResolver.RosterQuery(_context, g)
                .Where(a => a.UnitId == request.UnitId)
                .Select(a => a.MemberId).Distinct().ToListAsync(cancellationToken);
            if (memberIds.Count > 0) // hide groups that match no one in this unit
                rosterGroups.Add(new UnitRosterGroupDto(g.Id, g.Name, memberIds));
        }

        return new UnitDashboardDto(
            unit.Id, unit.Name, unit.UnitTypeName,
            assignments.Count, teams,
            teamGroups, unassigned, rosterGroups
        );
    }
}

// Summary for super admin / overview
public record AdminDashboardDto(
    int TotalMembers,
    int Boys,
    int Girls,
    int Ungendered,
    int MembersWithoutUnit,
    int UnpaidCotisations,
    int MissingDocuments,
    IReadOnlyList<UnitBreakdownDto> UnitBreakdown,
    IReadOnlyList<AgeGroupDto> AgeGroups
);

public record UnitBreakdownDto(string UnitCode, string UnitName, int MemberCount, int DocCompliance);
public record AgeGroupDto(string Label, int Count);

public record GetAdminDashboardQuery(string ScoutYear) : IRequest<AdminDashboardDto>;

public class GetAdminDashboardQueryHandler : IRequestHandler<GetAdminDashboardQuery, AdminDashboardDto>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetAdminDashboardQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<AdminDashboardDto> Handle(GetAdminDashboardQuery request, CancellationToken cancellationToken)
    {
        // The group-wide overview is for super-admins and group-level users — the Chef de Groupe (has
        // maitrise.manage) AND the Assistant Chef de Groupe (group-level role but no maitrise.manage). An
        // ACG holds a group-level profile, so allow anyone with an active group-level assignment.
        if (!_currentUser.IsSuperAdmin && !_currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MaitriseManage))
        {
            var isGroupLevel = _currentUser.MemberId is Guid mid && await _context.MemberAssignments.AnyAsync(a =>
                a.MemberId == mid && a.EndDate == null && !a.IsDeleted && a.FunctionalRole.SecurityProfile.IsGroupLevel, cancellationToken);
            if (!isGroupLevel) throw new UnauthorizedAccessException();
        }

        var ct = cancellationToken;

        // Scout-year window (Oct 1 → Oct 1, matching the migration's Oct-1 boundary). A member is
        // counted for the year if they had an assignment ACTIVE during it (date-range overlap), so the
        // dashboard reflects the group as it was that scout year — not just "today". Half-open: started
        // before the year ends, and not already ended at/before it starts (an assignment ending exactly
        // on Oct 1 belongs to the year that just ended).
        var (windowStart, windowEnd) = ScoutYearHelper.Window(request.ScoutYear);
        // For the IN-PROGRESS scout year the overlap window runs into the future, so a plain overlap counts
        // everyone who was in a unit at ANY point this year — including members who have since LEFT — which
        // overstates the live roster. So: current/future year → a point-in-time "today" snapshot (members
        // whose assignment is still open now); a past year → the overlap window (who was active during it).
        // Both count DISTINCT members, never assignment rows (a member with >1 assignment in a unit counts once).
        var today = LebanonClock.Today;
        var yearInProgress = windowEnd > today;
        var membersInYear = yearInProgress
            ? _context.Members.Where(m => m.Assignments.Any(a => a.EndDate == null && a.StartDate <= today))
            : _context.Members.Where(m => m.Assignments.Any(a => a.StartDate < windowEnd && (a.EndDate == null || a.EndDate > windowStart)));

        // Member counts via SQL aggregates (avoids materializing every member row just to count).
        var genderCounts = await membersInYear
            .GroupBy(m => m.Gender)
            .Select(g => new { Gender = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var totalMembers = genderCounts.Sum(g => g.Count);
        var boys = genderCounts.Where(g => string.Equals(g.Gender, "Masculin", StringComparison.OrdinalIgnoreCase)).Sum(g => g.Count);
        var girls = genderCounts.Where(g => string.Equals(g.Gender, "Féminin", StringComparison.OrdinalIgnoreCase)).Sum(g => g.Count);
        var ungendered = totalMembers - boys - girls;
        // Year-scoped: every counted member has a unit that year, so "sans unité" doesn't apply here.
        var withoutUnit = 0;

        // The in-year members are reused below (unpaid / missing-docs / age groups), so fetch just that
        // subset (Id + DOB) rather than the whole members table.
        var activeMembers = await membersInYear
            .Select(m => new { m.Id, m.DateOfBirth })
            .ToListAsync(ct);
        var activeMemberIds = activeMembers.Select(m => m.Id).ToHashSet();

        // Unpaid cotisations
        var paidMemberIds = (await _context.MemberCotisations
            .Where(c => c.ScoutYear == request.ScoutYear)
            .Select(c => c.MemberId)
            .ToListAsync(ct)).ToHashSet();
        var unpaidCotisations = activeMemberIds.Count(id => !paidMemberIds.Contains(id));

        // Doc compliance: how many active doc types each active member has. Computed ONCE over the full
        // active-member set and reused for BOTH the "missing documents" tile and the per-unit breakdown
        // (unit members are a subset of the active members), rather than scanning member_documents twice.
        var activeDocTypeCount = await _context.DocumentTypes.CountAsync(dt => dt.IsActive, ct);
        var docCountsByMember = activeDocTypeCount > 0
            ? await _context.MemberDocuments
                .Where(d => activeMemberIds.Contains(d.MemberId) && d.DocumentType.IsActive)
                .GroupBy(d => d.MemberId)
                .Select(g => new { MemberId = g.Key, TypeCount = g.Select(d => d.DocumentTypeId).Distinct().Count() })
                .ToDictionaryAsync(g => g.MemberId, g => g.TypeCount, ct)
            : new Dictionary<Guid, int>();

        // Missing documents: active members who are missing at least one active doc type.
        var membersWithAllDocs = activeDocTypeCount > 0
            ? activeMemberIds.Count(id => docCountsByMember.GetValueOrDefault(id, 0) >= activeDocTypeCount)
            : 0;
        var missingDocuments = activeMemberIds.Count - membersWithAllDocs;

        // Unit breakdown — DISTINCT members per unit (not assignment rows), using the same year predicate as
        // the totals above. Materialize the (unit, member) pairs, dedupe, and keep only valid in-year members
        // (activeMemberIds already excludes soft-deleted ones), so the per-unit counts sum to the total.
        var membershipPairs = await (yearInProgress
                ? _context.MemberAssignments.Where(a => a.EndDate == null && a.StartDate <= today)
                : _context.MemberAssignments.Where(a => a.StartDate < windowEnd && (a.EndDate == null || a.EndDate > windowStart)))
            .Select(a => new { a.UnitId, a.MemberId })
            .Distinct()
            .ToListAsync(ct);
        var membersByUnit = membershipPairs
            .Where(x => activeMemberIds.Contains(x.MemberId))
            .GroupBy(x => x.UnitId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.MemberId).ToList());

        var units = await _context.Units
            .Where(u => u.IsActive)
            .OrderBy(u => u.Name)
            .Select(u => new { u.Id, u.Code, u.Name })
            .ToListAsync(ct);

        var unitBreakdown = units.Select(u =>
        {
            var ids = membersByUnit.GetValueOrDefault(u.Id, []);
            var count = ids.Count;
            var compliant = activeDocTypeCount > 0
                ? ids.Count(mid => docCountsByMember.GetValueOrDefault(mid, 0) >= activeDocTypeCount)
                : count;
            var pct = count > 0 ? (int)Math.Round(100.0 * compliant / count) : 100;
            return new UnitBreakdownDto(u.Code, u.Name, count, pct);
        }).ToList();

        // Age groups — ages as of the start of the selected scout year (Oct 1), so past years show the
        // members' ages as they were then, not today.
        var ageRef = windowStart;
        var ageGroups = new List<AgeGroupDto>();
        var withDob = activeMembers.Where(m => m.DateOfBirth.HasValue).ToList();
        var ages = withDob.Select(m => ageRef.Year - m.DateOfBirth!.Value.Year - (ageRef.DayOfYear < m.DateOfBirth.Value.DayOfYear ? 1 : 0)).ToList();
        ageGroups.Add(new AgeGroupDto("7-10 ans", ages.Count(a => a >= 7 && a <= 10)));
        ageGroups.Add(new AgeGroupDto("11-14 ans", ages.Count(a => a >= 11 && a <= 14)));
        ageGroups.Add(new AgeGroupDto("15-17 ans", ages.Count(a => a >= 15 && a <= 17)));
        ageGroups.Add(new AgeGroupDto("18-21 ans", ages.Count(a => a >= 18 && a <= 21)));
        ageGroups.Add(new AgeGroupDto("22+ ans", ages.Count(a => a >= 22)));

        return new AdminDashboardDto(totalMembers, boys, girls, ungendered, withoutUnit, unpaidCotisations, missingDocuments, unitBreakdown, ageGroups);
    }
}
