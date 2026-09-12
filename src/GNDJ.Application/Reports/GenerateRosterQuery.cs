using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Reports;

// Roster PDF (A4 landscape table). Single unit (UnitId, optional TeamId) OR multiple units (UnitIds, set by the
// template generator for a units/branch/group scope) — grouped by team (multi-unit blocks are prefixed with the
// unit name). `Columns` picks + orders the printed fields; MemberFilter = all | youth | maitrise.
public record GenerateRosterQuery(
    Guid UnitId,
    Guid? TeamId,
    string ScoutYear,
    List<string> Columns,
    List<Guid>? UnitIds = null,
    string? Title = null,
    string? MemberFilter = null
) : IRequest<Result<byte[]>>;

public class GenerateRosterQueryHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IRosterService rosterService
) : IRequestHandler<GenerateRosterQuery, Result<byte[]>>
{
    public async ValueTask<Result<byte[]>> Handle(GenerateRosterQuery request, CancellationToken ct)
    {
        var unitIds = request.UnitIds is { Count: > 0 } ? request.UnitIds : [request.UnitId];
        // Access + gather + group (rich fields, maîtrise/youth filter, per-unit/team sections) is shared with export.
        var collected = await ReportDataCollector.CollectAsync(
            context, currentUser, unitIds, request.TeamId, request.MemberFilter, request.Title, ct);
        if (!collected.IsSuccess) return Result<byte[]>.Failure(collected.Error!);
        var (title, sections) = collected.Value;

        var teams = sections
            .Select(s => new RosterTeamData(s.Label, s.Rows.Select(ToRosterMember).ToList()))
            .ToList();

        var rosterData = new RosterData(title, request.ScoutYear, request.Columns, teams);
        return Result<byte[]>.Success(rosterService.Generate(rosterData));
    }

    private static RosterMemberData ToRosterMember(ReportRow r) => new(
        r.Name, r.CardNumber, r.Gender, r.DateOfBirth, r.Age, r.BloodType, r.Nationality, r.School, r.Classe, r.Section,
        r.Phone, r.Email, r.RoleName, r.TeamName, r.CustomFields,
        r.UnitName, r.FirstName, r.LastName, r.ExternalCardNumber, r.Profession, r.ProfessionDomain, r.Address,
        r.PrimaryContactEmail, r.FatherName, r.FatherPhone, r.MotherName, r.MotherPhone, r.GuardianEmails, r.StartDate);
}
