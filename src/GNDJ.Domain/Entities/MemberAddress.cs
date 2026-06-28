using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A postal address for a member. City is matched against the managed member.cities list at entry.
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
