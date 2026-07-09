namespace GNDJ.Application.Auth.DTOs;

// Returned by Login/Register/RefreshToken — the tokens + the permission list the client caches for UI gating.
public record AuthResponse(
    Guid UserId,
    Guid MemberId,
    string Email,
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    IReadOnlyList<string> Permissions
);

// Returned by GetMe — the current user's profile plus the unit/role access list driving role-based UI.
public record MeResponse(
    Guid UserId,
    Guid MemberId,
    string Email,
    string FirstName,
    string LastName,
    bool IsSuperAdmin,
    IReadOnlyList<string> Permissions,
    IReadOnlyList<UnitAccessDto> UnitAccess
);

public record UnitAccessDto(
    Guid UnitId,
    string UnitName,
    string RoleName,
    // True when this assignment's role is a LEADERSHIP role (its profile grants members.edit) — i.e. the
    // member manages this unit, vs. just belonging to it as a youth. Drives which unit the leader dashboard
    // defaults to (a member who is a youth in one unit and a chef in another lands on the unit they lead).
    bool IsLeader,
    // True when this assignment's role is a GROUP-LEVEL role (CG/ACG — profile IsGroupLevel), which grants
    // all-units access. Lets the UI separate "group leader" assignments (the Maîtrise de Groupe unit) from
    // real CU/ACU unit-leadership when someone holds both.
    bool IsGroupLevel
);
