using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A login account for a Member (1:1). Holds the BCrypt password hash, the super-admin flag, and the
// rotating refresh + password-reset tokens. Permissions come from the member's role, not stored here.
public class User : BaseEntity
{
    public Guid MemberId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsSuperAdmin { get; set; } // full access, independent of any role/profile (manual flag)
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    // Updated on login AND on every token refresh (~15-min heartbeat while the user is active) — the
    // "active sessions" admin view uses it as a live "last activity"/presence signal (LastLoginAt stays
    // the original login time). Null for accounts that never signed in.
    public DateTime? LastActivityAt { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetTokenExpiry { get; set; }

    // When true, the user is forced to set a new password before using the app (login returns the flag; the
    // frontend routes to a mandatory change-password screen). Set on any admin/temp-password path (leader reset,
    // member auto-creation); cleared once the user sets their own password (activation link, reset, or change).
    public bool MustChangePassword { get; set; }

    // Per-user customization of the group dashboard: a JSON array of widget configs (id + visible + width),
    // in display order. Null = the default layout. Stored opaquely (the frontend owns the widget schema and
    // merges against its registry on load, so adding a widget later is forward-compatible). Auth-only, own account.
    public string? DashboardLayoutJson { get; set; }

    public Member Member { get; set; } = null!;
}
