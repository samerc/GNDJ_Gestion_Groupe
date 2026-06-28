namespace GNDJ.Application.Associations.DTOs;

// List-row shape for an association (top of the org tree: association → unit → team → member).
// UnitCount is a derived count of its non-deleted units.
public record AssociationDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    int UnitCount,
    DateTime CreatedAt
);

// Full association record for the edit/detail view.
public record AssociationDetailDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
