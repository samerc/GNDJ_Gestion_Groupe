namespace GNDJ.Application.Units.DTOs;

// List-row shape for a unit. AssociationId is nullable: a unit may belong to no association or span
// both (e.g. Maîtrise de Groupe) — shown as "Inter-associations". Slug/IsPublished/FoundedDate drive
// the public website.
public record UnitDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    bool IsActive,
    Guid? AssociationId,
    string? AssociationName,
    Guid UnitTypeId,
    string UnitTypeName,
    string UnitTypeCode, // branch code (MEU/RON/COM/TRO/…) — drives youth-vs-older UI decisions
    int TeamCount,
    int MemberCount,
    string? Slug,
    bool IsPublished,
    DateOnly? FoundedDate
);

// Full unit record for the edit/detail view (adds timestamps to UnitDto's fields).
public record UnitDetailDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    bool IsActive,
    Guid? AssociationId,
    string? AssociationName,
    Guid UnitTypeId,
    string UnitTypeName,
    int TeamCount,
    int MemberCount,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string? Slug,
    bool IsPublished,
    DateOnly? FoundedDate
);
