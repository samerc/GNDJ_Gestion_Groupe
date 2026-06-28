using GNDJ.Domain.Common;
using GNDJ.Domain.Enums;

namespace GNDJ.Domain.Entities;

// A member-to-member relationship (sibling, etc.). Used for sibling detection across the group;
// distinct from Guardian (parent/tuteur) links. May flag the related member as a primary/emergency contact.
public class MemberRelationship : BaseEntity
{
    public Guid MemberId { get; set; }
    public Guid RelatedMemberId { get; set; }
    public RelationshipType RelationshipType { get; set; }
    public bool IsPrimaryContact { get; set; }
    public bool IsEmergencyContact { get; set; }
    public string? Notes { get; set; }

    public Member Member { get; set; } = null!;
    public Member RelatedMember { get; set; } = null!;
}
