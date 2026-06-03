namespace GNDJ.Application.Members.DTOs;

public record MemberListDto(
    Guid Id,
    string FirstName,
    string LastName,
    DateOnly? DateOfBirth,
    string? Gender,
    string? CardNumber,
    string? PrimaryEmail,
    string? PrimaryPhone,
    string? PhotoPath,
    string? UnitName,
    string? TeamName
);

public record MemberDetailDto(
    Guid Id,
    string FirstName,
    string LastName,
    DateOnly? DateOfBirth,
    string? Gender,
    string? CardNumber,
    string? BloodType,
    string? Nationality,
    string? School,
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
