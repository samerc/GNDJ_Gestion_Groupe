namespace GNDJ.Application.Common.Interfaces;

public record CampReportData(string CampName, string ScoutYear,
    IReadOnlyList<CampReportFamille> Familles, IReadOnlyList<CampReportUnit> Units);

public record CampReportFamille(int Number, string? PereName, string? MereName, IReadOnlyList<CampReportMember> Members);

public record CampReportUnit(string UnitName, IReadOnlyList<CampReportMember> Members);

public record CampReportMember(string Name, string? Gender, string? Branche, string? UnitName, string? TeamName, double? Note, int? FamilleNumber, string? Role);

// Renders Camp BP PDFs: a single famille sheet, all familles (one per page), or members grouped by unit.
public interface ICampReportService
{
    byte[] Famille(CampReportData data, int familleNumber);   // one famille
    byte[] AllFamilles(CampReportData data);                  // all familles, one per page
    byte[] UnitList(CampReportData data);                     // members grouped by unit, with famille number
}
