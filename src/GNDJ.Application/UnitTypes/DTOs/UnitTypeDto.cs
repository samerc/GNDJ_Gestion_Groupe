namespace GNDJ.Application.UnitTypes.DTOs;

public record UnitTypeDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    int? NumberOfYears,
    int UnitCount,
    DateTime CreatedAt
);

public record UnitTypeDetailDto(
    Guid Id,
    string Name,
    string Code,
    string? Description,
    int? NumberOfYears,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
