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
    string RoleName
);
