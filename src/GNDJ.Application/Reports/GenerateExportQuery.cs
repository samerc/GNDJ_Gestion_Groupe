using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

public record GenerateExportQuery(
    Guid UnitId,
    Guid? TeamId,
    string ScoutYear,
    List<string> Columns,
    string Format // "excel" or "csv"
) : IRequest<Result<ExportResult>>;

public record ExportResult(byte[] Data, string ContentType, string FileName);

public class GenerateExportQueryHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IExportService exportService
) : IRequestHandler<GenerateExportQuery, Result<ExportResult>>
{
    public async ValueTask<Result<ExportResult>> Handle(GenerateExportQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.AuthorizedUnitIds.Contains(request.UnitId))
            return Result<ExportResult>.Failure("Accès non autorisé.");

        var unit = await context.Units
            .Where(u => u.Id == request.UnitId)
            .Select(u => u.Name)
            .FirstOrDefaultAsync(ct);

        if (unit is null) return Result<ExportResult>.Failure("Unité introuvable.");

        var query = context.MemberAssignments
            .Where(a => a.UnitId == request.UnitId && a.EndDate == null);

        if (request.TeamId.HasValue)
            query = query.Where(a => a.TeamId == request.TeamId.Value);

        var assignments = await query
            .OrderByDescending(a => a.Team != null ? a.Team.IsMaitrise : false)
            .ThenBy(a => a.Team != null ? a.Team.DisplayOrder : 999)
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

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var title = request.TeamId.HasValue
            ? $"{unit} \u2014 {assignments.FirstOrDefault()?.TeamName ?? "\u00c9quipe"}"
            : unit;

        var teams = assignments
            .GroupBy(a => new { a.TeamName, a.TeamOrder, a.TeamIsMaitrise })
            .OrderByDescending(g => g.Key.TeamIsMaitrise).ThenBy(g => g.Key.TeamOrder)
            .Select(g => new ExportTeamData(
                g.Key.TeamName ?? "Sans \u00e9quipe",
                g.Select(a =>
                {
                    int? age = a.DateOfBirth.HasValue
                        ? today.Year - a.DateOfBirth.Value.Year - (today.DayOfYear < a.DateOfBirth.Value.DayOfYear ? 1 : 0)
                        : null;
                    return new ExportMemberData(
                        $"{a.FirstName} {a.LastName}", a.CardNumber, a.Gender,
                        a.DateOfBirth?.ToString("dd/MM/yyyy"), age,
                        a.BloodType, a.Nationality, a.School, a.Classe, a.Section,
                        a.Phone, a.Email, a.RoleName, a.TeamName,
                        customByMember.GetValueOrDefault(a.Id, [])
                    );
                }).ToList()
            )).ToList();

        var exportData = new ExportData(title, request.Columns, teams);

        if (request.Format == "csv")
        {
            var csv = exportService.GenerateCsv(exportData);
            return Result<ExportResult>.Success(new ExportResult(
                csv,
                "text/csv; charset=utf-8",
                $"{SanitizeFileName(title)}.csv"));
        }
        else
        {
            var excel = exportService.GenerateExcel(exportData);
            return Result<ExportResult>.Success(new ExportResult(
                excel,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                $"{SanitizeFileName(title)}.xlsx"));
        }
    }

    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        return string.Concat(name.Select(c => invalid.Contains(c) ? '_' : c)).Replace(" ", "_");
    }
}
