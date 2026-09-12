namespace GNDJ.Application.Common.Interfaces;

public record RosterData(
    string Title,
    string ScoutYear,
    IReadOnlyList<string> Columns,
    IReadOnlyList<RosterTeamData> Teams
);

public record RosterTeamData(string TeamName, IReadOnlyList<RosterMemberData> Members);

// A flat member row for a report. The first block is the historical set; everything after CustomFields is the
// "as much info as possible" extension (all optional so existing callers keep compiling). The roster/export
// services pick which of these to print from the ordered Columns list.
public record RosterMemberData(
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

// Renders a printable unit roster PDF (A4 landscape, selectable columns, grouped by team).
public interface IRosterService
{
    byte[] Generate(RosterData data);
}
