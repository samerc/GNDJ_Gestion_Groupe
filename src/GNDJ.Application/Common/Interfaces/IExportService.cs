namespace GNDJ.Application.Common.Interfaces;

public record ExportData(
    string Title,
    IReadOnlyList<string> Columns,
    IReadOnlyList<ExportTeamData> Teams
);

public record ExportTeamData(string TeamName, IReadOnlyList<ExportMemberData> Members);

public record ExportMemberData(
    string Name, string? CardNumber, string? Gender, string? DateOfBirth, int? Age,
    string? BloodType, string? Nationality, string? School, string? Classe, string? Section,
    string? Phone, string? Email, string? RoleName, string? TeamName,
    IReadOnlyList<MemberCardCustomField> CustomFields,
    string? UnitName = null, string? FirstName = null, string? LastName = null,
    string? ExternalCardNumber = null, string? Profession = null, string? ProfessionDomain = null,
    string? Address = null, string? PrimaryContactEmail = null,
    string? FatherName = null, string? FatherPhone = null, string? MotherName = null, string? MotherPhone = null,
    string? GuardianEmails = null, string? StartDate = null
);

// Exports a unit roster (grouped by team, selected columns + custom fields) to Excel (.xlsx) or CSV.
public interface IExportService
{
    byte[] GenerateExcel(ExportData data);
    byte[] GenerateCsv(ExportData data);
}
