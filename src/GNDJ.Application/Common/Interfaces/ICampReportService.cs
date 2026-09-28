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

// ── Grand jeu printouts ──
// A famille's passport: who they are + their 25 steps (time, game, place, opponent) with blank boxes
// (note /5, énigme, signature) filled in by the étapistes during the camp.
public record CampPassportStep(int Slot, DateOnly Date, TimeOnly Start, TimeOnly End, int GameNumber, string? GameName, string? Location, int Opponent);
public record CampPassportFamille(int Number, string? Name, string? Description, string? SuperFamille, string? PereName, string? MereName,
    IReadOnlyList<string> Members, IReadOnlyList<CampPassportStep> Steps);
// A game's score sheet: the matches of that game (one per slot) with blank boxes, for scoring on paper.
public record CampScoreSheetRow(int Slot, DateOnly Date, TimeOnly Start, TimeOnly End, int FamilleA, int FamilleB);
public record CampScoreSheetGame(int Number, string? Name, string? Location, string? BackupLocation, IReadOnlyList<string> Etapistes,
    IReadOnlyList<CampScoreSheetRow> Rows);

public interface ICampRotationReportService
{
    byte[] Passports(string campName, bool useBackup, IReadOnlyList<CampPassportFamille> familles);   // one page per famille
    byte[] ScoreSheets(string campName, IReadOnlyList<CampScoreSheetGame> games);                     // one page per game
}
