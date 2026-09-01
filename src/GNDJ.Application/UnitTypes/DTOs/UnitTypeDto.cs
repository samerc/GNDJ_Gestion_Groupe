namespace GNDJ.Application.UnitTypes.DTOs;

// List-row shape for a unit type (branch). UnitCount = derived count of non-deleted units of this type.
public record UnitTypeDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    int? NumberOfYears,
    int? AgeMin,
    int? AgeMax,
    string? Color,
    int UnitCount,
    DateTime CreatedAt,
    string? PublicDescription,
    string? Gender // Masculin | Féminin | Mixte | null — drives demande unit eligibility/suggestions
);

// Full unit-type record for the edit/detail view.
public record UnitTypeDetailDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    int? NumberOfYears,
    int? AgeMin,
    int? AgeMax,
    string? Color,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    string? PublicDescription,
    string? Gender
);
