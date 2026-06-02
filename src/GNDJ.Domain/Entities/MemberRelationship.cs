using GNDJ.Domain.Common;
using GNDJ.Domain.Enums;

namespace GNDJ.Domain.Entities;

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
