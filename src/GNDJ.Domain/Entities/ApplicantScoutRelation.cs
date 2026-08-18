using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A person related to the applicant who is/was a scout — shared across the account's demandes.
// Either linked to an existing member (current/alumni in our group) or entered manually (other group).
public class ApplicantScoutRelation : BaseEntity
{
    public Guid ApplicantAccountId { get; set; }
    public string Status { get; set; } = string.Empty; // ScoutRelationStatus: CurrentInGroup | AncienInGroup | OtherGroup
    public string? Relationship { get; set; }          // Frère, Sœur, Cousin, ...

    public Guid? RelatedMemberId { get; set; }          // set when selected from our group

    // Manual entry (when not linked to a member)
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? LastUnit { get; set; }     // for AncienInGroup entered manually
    public string? LastFunction { get; set; } // for AncienInGroup entered manually
    public string? OtherGroupName { get; set; } // for OtherGroup
    public bool OtherGroupIsFormer { get; set; } // for OtherGroup: true = ancien de ce groupe, false = membre actuel

    public ApplicantAccount ApplicantAccount { get; set; } = null!;
    public Member? RelatedMember { get; set; }
}
