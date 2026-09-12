using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Reports;

// Spreadsheet export (Excel .xlsx via ClosedXML, or UTF-8 CSV) — same gathering as the roster PDF, different
// sink. Single unit (UnitId, optional TeamId) OR multiple units (UnitIds, template units/branch/group scope).
// Returns bytes + content type + filename.
public record GenerateExportQuery(
    Guid UnitId,
    Guid? TeamId,
    string ScoutYear,
    List<string> Columns,
    string Format, // "excel" or "csv"
    List<Guid>? UnitIds = null,
    string? Title = null,
    string? MemberFilter = null
) : IRequest<Result<ExportResult>>;

public class GenerateExportQueryValidator : AbstractValidator<GenerateExportQuery>
{
    public GenerateExportQueryValidator()
    {
        RuleFor(x => x.Format).Must(f => f is "excel" or "csv").WithMessage("Format invalide (excel ou csv).");
        RuleFor(x => x.ScoutYear).MaximumLength(20);
        RuleFor(x => x.Columns).NotEmpty().WithMessage("Au moins une colonne est requise.")
            .Must(c => c.Count <= 100).WithMessage("Trop de colonnes.");
        RuleForEach(x => x.Columns).MaximumLength(100);
    }
}

public record ExportResult(byte[] Data, string ContentType, string FileName);

public class GenerateExportQueryHandler(
    IApplicationDbContext context,
    ICurrentUserService currentUser,
    IExportService exportService
) : IRequestHandler<GenerateExportQuery, Result<ExportResult>>
{
    public async ValueTask<Result<ExportResult>> Handle(GenerateExportQuery request, CancellationToken ct)
    {
        var unitIds = request.UnitIds is { Count: > 0 } ? request.UnitIds : [request.UnitId];
        var collected = await ReportDataCollector.CollectAsync(
            context, currentUser, unitIds, request.TeamId, request.MemberFilter, request.Title, ct);
        if (!collected.IsSuccess) return Result<ExportResult>.Failure(collected.Error!);
        var (title, sections) = collected.Value;

        var teams = sections
            .Select(s => new ExportTeamData(s.Label, s.Rows.Select(ToExportMember).ToList()))
            .ToList();

        var exportData = new ExportData(title, request.Columns, teams);

        if (request.Format == "csv")
        {
            var csv = exportService.GenerateCsv(exportData);
            return Result<ExportResult>.Success(new ExportResult(csv, "text/csv; charset=utf-8", $"{SanitizeFileName(title)}.csv"));
        }
        var excel = exportService.GenerateExcel(exportData);
        return Result<ExportResult>.Success(new ExportResult(
            excel, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{SanitizeFileName(title)}.xlsx"));
    }

    private static ExportMemberData ToExportMember(ReportRow r) => new(
        r.Name, r.CardNumber, r.Gender, r.DateOfBirth, r.Age, r.BloodType, r.Nationality, r.School, r.Classe, r.Section,
        r.Phone, r.Email, r.RoleName, r.TeamName, r.CustomFields,
        r.UnitName, r.FirstName, r.LastName, r.ExternalCardNumber, r.Profession, r.ProfessionDomain, r.Address,
        r.PrimaryContactEmail, r.FatherName, r.FatherPhone, r.MotherName, r.MotherPhone, r.GuardianEmails, r.StartDate);

    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        return string.Concat(name.Select(c => invalid.Contains(c) ? '_' : c)).Replace(" ", "_");
    }
}
