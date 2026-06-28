namespace GNDJ.Application.Assignments.DTOs;

// A member's placement (unit + optional team + functional role) over a date range.
// IsActive = EndDate is null (open-ended); a closed assignment is history.
public record AssignmentDto(
    Guid Id,
    Guid MemberId,
    string MemberFirstName,
    string MemberLastName,
    Guid UnitId,
    string UnitName,
    Guid UnitTypeId,
    Guid? TeamId,
    string? TeamName,
    Guid FunctionalRoleId,
    string FunctionalRoleName,
    DateOnly StartDate,
    DateOnly? EndDate,
    string? Notes,
    bool IsActive
);
