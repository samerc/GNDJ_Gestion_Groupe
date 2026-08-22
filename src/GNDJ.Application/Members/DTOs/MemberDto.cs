namespace GNDJ.Application.Members.DTOs;

// Row in the members list (PrimaryEmail/Phone are withheld — null — in the alumni view).
public record MemberListDto(
    Guid Id,
    string FirstName,
    string LastName,
    DateOnly? DateOfBirth,
    string? Gender,
    string? CardNumber,
    string? ExternalCardNumber,
    string? PrimaryEmail,
    string? PrimaryPhone,
    string? PhotoPath,
    string? UnitName,
    string? TeamName,
    string? RoleName,
    int? RoleRank,
    string? FatherName,
    // Dossier compliance (active members only; null for the alumni view). DocsComplete = an Approved
    // document exists for every active document type. CotisationOk = current-year cotisation paid or
    // exempt; null when no current scout year is configured (cotisation not tracked). Computed per page.
    bool? DocsComplete = null,
    bool? CotisationOk = null
);

// Full member profile incl. contact collections (phones/emails/addresses), primary-first.
public record MemberDetailDto(
    Guid Id,
    string FirstName,
    string LastName,
    DateOnly? DateOfBirth,
    string? Gender,
    string? CardNumber,
    string? ExternalCardNumber,
    string? BloodType,
    string? Nationality,
    string? School,
    string? Classe,
    string? Section,
    string? MedicalNotes,
    string? Allergies,
    string? Notes,
    string? PhotoPath,
    IReadOnlyList<MemberPhoneDto> Phones,
    IReadOnlyList<MemberEmailDto> Emails,
    IReadOnlyList<MemberAddressDto> Addresses,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string? Username, // login of the linked user account (null if the member has no account)
    string? PrimaryContactEmail, // designated recipient for member-facing mail (null = auto)
    IReadOnlyList<string> GuardianEmails, // distinct guardian emails available as contact options
    MemberTabCountsDto Counts, // per-tab badge counts, so the detail panel needs no extra count queries
    int AbsencesThisYear // count of the member's absences on approved séances in the current scout year
);

// Counts shown as tab badges on the member detail panel — folded into the detail query so opening a member
// is ONE request instead of six (previously five secondary list queries fired just for these numbers).
public record MemberTabCountsDto(int Famille, int Unites, int Documents, int Cotisations, int Progression);

public record MemberPhoneDto(Guid Id, string CountryCode, string Number, string Type, bool IsPrimary, bool IsEmergency);
public record MemberEmailDto(Guid Id, string Address, string Type, bool IsPrimary, bool IsEmergency);
public record MemberAddressDto(Guid Id, string Type, string Country, string City, string? Details, bool IsPrimary);
