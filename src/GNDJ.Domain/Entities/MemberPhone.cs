using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A phone number for a member. IsPrimary marks the preferred one; IsEmergency marks an emergency contact.
public class MemberPhone : BaseEntity
{
    public Guid MemberId { get; set; }
    public string CountryCode { get; set; } = string.Empty;
    public string Number { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // Mobile, Domicile, Travail, Autre
    public bool IsPrimary { get; set; }
    public bool IsEmergency { get; set; }

    public Member Member { get; set; } = null!;
}
