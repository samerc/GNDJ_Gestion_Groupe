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
    IReadOnlyList<MemberCardCustomField> CustomFields
);

public interface IExportService
{
    byte[] GenerateExcel(ExportData data);
    byte[] GenerateCsv(ExportData data);
}
