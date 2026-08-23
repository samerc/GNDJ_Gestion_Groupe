namespace GNDJ.Application.Auth.DTOs;

// Returned by Login/Register/RefreshToken — the tokens + the permission list the client caches for UI gating.
public record AuthResponse(
    Guid UserId,
    Guid MemberId,
    string Email,
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    IReadOnlyList<string> Permissions,
    // True when the user must set a new password before using the app (temp/imported/reset password). The
    // client routes to a mandatory change-password screen and blocks the rest of the app until it's cleared.
    bool MustChangePassword = false
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
    IReadOnlyList<UnitAccessDto> UnitAccess,
    // Mirrors AuthResponse.MustChangePassword so a page reload (which calls GetMe, not Login) still knows to
    // force the change-password screen.
    bool MustChangePassword = false,
    // True when the member leads at least one team (active IsTeamLeader assignment) — drives the "Séances" nav
    // for a chef d'équipe who otherwise has no admin permission.
    bool LeadsTeam = false,
    // True when the member's dossier was put on hold at the end of the document-verification campaign — the app
    // shows a suspended banner and disables their document upload until the CG reactivates them.
    bool IsOnHold = false,
    // True when the caller is a leader who hasn't yet confirmed their PERSONAL contact details — the app shows a
    // one-time blocking "verify your email + phone" screen (many leaders still had a parent's on file).
    bool NeedsContactVerification = false,
    // The member's own email/phone to prefill that screen (their own, never a guardian's; empty if none).
    string? SuggestedEmail = null,
    string? SuggestedPhoneCountry = null,
    string? SuggestedPhone = null
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
