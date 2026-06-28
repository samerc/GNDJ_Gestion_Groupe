namespace GNDJ.Application.Teams.DTOs;

// A team/sizaine within a unit. Totem + Adjective form the full sizaine name; IsMaitrise marks the
// leadership team (pinned first in rosters/trombinoscope); MemberCount = active assignments.
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
