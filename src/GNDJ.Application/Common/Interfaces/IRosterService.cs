namespace GNDJ.Application.Common.Interfaces;

public record RosterData(
    string Title,
    string SchoolYear,
    IReadOnlyList<string> Columns,
    IReadOnlyList<RosterTeamData> Teams
);

public record RosterTeamData(string TeamName, IReadOnlyList<RosterMemberData> Members);

public record RosterMemberData(
    string Name, string? CardNumber, string? Gender, string? DateOfBirth, int? Age,
    string? BloodType, string? Nationality, string? School, string? Classe, string? Section,
    string? Phone, string? Email, string? RoleName, string? TeamName,
    IReadOnlyList<MemberCardCustomField> CustomFields
);

public interface IRosterService
{
    byte[] Generate(RosterData data);
}
