using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class ApiKey : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string KeyHash { get; set; } = string.Empty; // BCrypt hashed
    public string KeyPrefix { get; set; } = string.Empty; // First 8 chars for identification (e.g., "gndj_k1_")
    public string Scopes { get; set; } = string.Empty; // Comma-separated: "members:read-own,documents:upload"
    public Guid? MemberId { get; set; } // If key is bound to a specific member
    public bool IsActive { get; set; } = true;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? LastUsedAt { get; set; }

    public Member? Member { get; set; }
}
