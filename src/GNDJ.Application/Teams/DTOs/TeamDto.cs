namespace GNDJ.Application.Teams.DTOs;

public record TeamDto(
    Guid Id,
    string Name,
    string? Description,
    string? Totem,
    string? Adjective,
    string? Color1,
    string? Color2,
    int DisplayOrder,
    bool IsMaitrise,
    Guid UnitId,
    string UnitName,
    int MemberCount
);
