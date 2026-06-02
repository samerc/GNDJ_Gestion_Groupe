namespace GNDJ.Application.Associations.DTOs;

public record AssociationDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    int UnitCount,
    DateTime CreatedAt
);

public record AssociationDetailDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
