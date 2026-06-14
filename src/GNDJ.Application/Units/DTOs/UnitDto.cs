namespace GNDJ.Application.Units.DTOs;

public record UnitDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    bool IsActive,
    Guid AssociationId,
    string AssociationName,
    Guid UnitTypeId,
    string UnitTypeName,
    int TeamCount,
    int MemberCount,
    string? Slug,
    bool IsPublished,
    DateOnly? FoundedDate
);

public record UnitDetailDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    bool IsActive,
    Guid AssociationId,
    string AssociationName,
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
