namespace GNDJ.Application.UnitTypes.DTOs;

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
    string? PublicDescription
);

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
    string? PublicDescription
);
