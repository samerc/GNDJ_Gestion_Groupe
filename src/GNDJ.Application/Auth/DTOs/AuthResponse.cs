namespace GNDJ.Application.Auth.DTOs;

public record AuthResponse(
    Guid UserId,
    Guid MemberId,
    string Email,
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    IReadOnlyList<string> Permissions
);

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
