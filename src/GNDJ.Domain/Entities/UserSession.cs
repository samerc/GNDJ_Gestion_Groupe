namespace GNDJ.Domain.Entities;

// One signed-in DEVICE of a login account (phone, PC, tablet...). Each device keeps its own rotating refresh
// token, so signing in on one device no longer signs the others out (the old model stored ONE token on
// User and every login overwrote it). Plain table, no soft delete: signing out deletes the row.
public class UserSession
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid UserId { get; set; }
    // SHA-256 of the current refresh token (the raw token only lives on the device).
    public string TokenHash { get; set; } = string.Empty;
    // The token this one replaced, still accepted for a short grace window after a rotation: if the refresh
    // response is lost (flaky mobile network), the device retries with its old token instead of being
    // signed out. See UserSessions.GraceSeconds.
    public string? PreviousTokenHash { get; set; }
    public DateTime? RotatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    // "Rester connecté": the long window (kept when the token rotates).
    public bool RememberMe { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastActivityAt { get; set; }
    public string? UserAgent { get; set; }
    public string? IpAddress { get; set; }

    public User User { get; set; } = null!;
}
