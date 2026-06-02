namespace GNDJ.Application.Assignments.DTOs;

public record AssignmentDto(
    Guid Id,
    Guid MemberId,
    string MemberFirstName,
    string MemberLastName,
    Guid UnitId,
    string UnitName,
    Guid? TeamId,
    string? TeamName,
    Guid FunctionalRoleId,
    string FunctionalRoleName,
    DateOnly StartDate,
    DateOnly? EndDate,
    string? Notes,
    bool IsActive
);
