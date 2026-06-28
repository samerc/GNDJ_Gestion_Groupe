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
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetTokenExpiry { get; set; }

    public Member Member { get; set; } = null!;
}
