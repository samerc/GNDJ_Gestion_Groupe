using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;
using GNDJ.Application.Common;

namespace GNDJ.Application.Reports;

// Roster PDF (A4 landscape table) of a unit (or a single team), grouped by team with Maîtrise first.
// `Columns` selects which of the built-in fields + custom fields to print; layout is in IRosterService.
public record GenerateRosterQuery(
    Guid UnitId,
    Guid? TeamId,
    string ScoutYear,
    List<string> Columns
) : IRequest<Result<byte[]>>;

public class GenerateRosterQueryHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IRosterService rosterService
) : IRequestHandler<GenerateRosterQuery, Result<byte[]>>
{
    public async ValueTask<Result<byte[]>> Handle(GenerateRosterQuery request, CancellationToken ct)
    {
        // Leader-only report (multi-member PII): members.edit + unit scope, not bare co-unit membership.
        if (!currentUser.IsSuperAdmin && !(currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit) && currentUser.AuthorizedUnitIds.Contains(request.UnitId)))
            return Result<byte[]>.Failure("Accès non autorisé.");

        var unit = await context.Units
            .Where(u => u.Id == request.UnitId)
            .Select(u => new { u.Name })
            .FirstOrDefaultAsync(ct);

        if (unit is null) return Result<byte[]>.Failure("Unité introuvable.");

        // Reports show the school CODE (CNDJ, CSG, …), not the long name — resolve via member.school_codes.
        var schoolCodesJson = await context.Settings
            .Where(s => s.Key == "member.school_codes").Select(s => s.Value).FirstOrDefaultAsync(ct);
        var schoolCode = Common.SchoolCode.Resolver(schoolCodesJson);

        var query = context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null);

        if (request.TeamId.HasValue)
            query = query.Where(a => a.TeamId == request.TeamId.Value);

        var assignments = await query
            .OrderByDescending(a => a.Team != null ? a.Team.IsMaitrise : false)
            .ThenBy(a => a.Team != null ? a.Team.DisplayOrder : 999)
            .ThenByDescending(a => a.FunctionalRole.Rank)
            .ThenBy(a => a.Member.LastName).ThenBy(a => a.Member.FirstName)
            .Select(a => new
            {
                a.Member.Id,
                a.Member.FirstName, a.Member.LastName, a.Member.CardNumber,
                a.Member.Gender, a.Member.DateOfBirth, a.Member.BloodType,
                a.Member.Nationality, a.Member.School, a.Member.Classe, a.Member.Section,
                Phone = a.Member.Phones.Where(p => p.IsPrimary && !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault(),
                Email = a.Member.Emails.Where(e => e.IsPrimary && !e.IsDeleted).Select(e => e.Address).FirstOrDefault(),
                RoleName = a.FunctionalRole.Name,
                RoleRank = a.FunctionalRole.Rank,
                TeamName = a.Team != null ? a.Team.Name : null,
                TeamOrder = a.Team != null ? a.Team.DisplayOrder : 999,
                TeamIsMaitrise = a.Team != null ? a.Team.IsMaitrise : false,
            })
            .ToListAsync(ct);

        // Get custom field values for these members
        var memberIds = assignments.Select(a => a.Id).ToList();
        var customValues = await context.MemberCustomFieldValues
            .Where(v => memberIds.Contains(v.MemberId) && v.CustomField.IsActive)
            .Select(v => new { v.MemberId, v.CustomField.Name, v.Value })
            .ToListAsync(ct);

        var customByMember = customValues
            .GroupBy(v => v.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(v => new MemberCardCustomField(v.Name, v.Value)).ToList());

        var today = LebanonClock.Today;
        var title = request.TeamId.HasValue
            ? $"{unit.Name} \u2014 {assignments.FirstOrDefault()?.TeamName ?? "\u00c9quipe"}"
            : unit.Name;

        var teams = assignments
            .GroupBy(a => new { a.TeamName, a.TeamOrder, a.TeamIsMaitrise })
            .OrderByDescending(g => g.Key.TeamIsMaitrise).ThenBy(g => g.Key.TeamOrder)
            .Select(g => new RosterTeamData(
                g.Key.TeamName ?? "Sans \u00e9quipe",
                g.Select(a =>
                {
                    int? age = a.DateOfBirth.HasValue
                        ? today.Year - a.DateOfBirth.Value.Year - (today.DayOfYear < a.DateOfBirth.Value.DayOfYear ? 1 : 0)
                        : null;
                    return new RosterMemberData(
                        $"{a.FirstName} {a.LastName}", a.CardNumber, a.Gender,
                        a.DateOfBirth?.ToString("dd/MM/yyyy"), age,
                        a.BloodType, a.Nationality, schoolCode(a.School), a.Classe, a.Section,
                        a.Phone, a.Email, a.RoleName, a.TeamName,
                        customByMember.GetValueOrDefault(a.Id, [])
                    );
                }).ToList()
            )).ToList();

        var rosterData = new RosterData(title, request.ScoutYear, request.Columns, teams);
        return Result<byte[]>.Success(rosterService.Generate(rosterData));
    }
}
