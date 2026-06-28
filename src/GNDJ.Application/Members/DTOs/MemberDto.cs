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
    string? FatherName
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
    DateTime UpdatedAt
);

public record MemberPhoneDto(Guid Id, string CountryCode, string Number, string Type, bool IsPrimary, bool IsEmergency);
public record MemberEmailDto(Guid Id, string Address, string Type, bool IsPrimary, bool IsEmergency);
public record MemberAddressDto(Guid Id, string Type, string Country, string City, string? Details, bool IsPrimary);
