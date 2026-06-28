namespace GNDJ.Application.Common.Interfaces;

public record MemberCardData(
    string MemberName,
    string? CardNumber,
    string? UnitName,
    string? TeamName,
    string? RoleName,
    string? BloodType,
    string? DateOfBirth,
    string? PhotoPath,
    string? EmergencyContact,
    IReadOnlyList<MemberCardCustomField> CustomFields
);

public record MemberCardCustomField(string Name, string Value);

public record CardSettings(
    string OrgName,
    CardFieldSettings Fields
);

public record CardFieldSettings(
    bool Photo, bool Name, bool CardNumber, bool Unit, bool Team,
    bool Role, bool DateOfBirth, bool BloodType, bool EmergencyContact, bool CustomFields
);

// Renders member ID cards (credit-card sized) as PDF — single or bulk (10/A4) — using the admin's card
// designer field toggles. Implemented with QuestPDF in Infrastructure.
public interface IMemberCardService
{
    byte[] Generate(MemberCardData data, CardSettings settings);
    byte[] GenerateBulk(IReadOnlyList<MemberCardData> cards, CardSettings settings);
}
