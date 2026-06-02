using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class MemberAddress : BaseEntity
{
    public Guid MemberId { get; set; }
    public string Type { get; set; } = string.Empty; // Domicile, Travail, Autre
    public string Country { get; set; } = "Canada";
    public string City { get; set; } = string.Empty;
    public string? Details { get; set; }
    public bool IsPrimary { get; set; }

    public Member Member { get; set; } = null!;
}
