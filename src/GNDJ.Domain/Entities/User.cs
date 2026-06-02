using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class User : BaseEntity
{
    public Guid MemberId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsSuperAdmin { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiry { get; set; }

    public Member Member { get; set; } = null!;
}
