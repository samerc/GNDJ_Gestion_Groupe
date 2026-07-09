using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A member-proposed change to their own data that needs a leader's approval before it takes effect.
// Used for progression and fonctions (assignment) — the parts of the member self-edit that are NOT applied
// directly. The proposed data lives in PayloadJson (deserialized when approved to create the real record);
// Summary is a human-readable one-liner for the review list. Status: Pending → Approved | Rejected.
public class MemberChangeRequest : BaseEntity
{
    public Guid MemberId { get; set; }
    public Member Member { get; set; } = null!;

    public string Kind { get; set; } = string.Empty;      // "Progression" | "Assignment"
    public string PayloadJson { get; set; } = string.Empty; // the proposed values (JSON)
    public string Summary { get; set; } = string.Empty;     // human-readable, for the CU/CG review list

    public string Status { get; set; } = "Pending";         // Pending | Approved | Rejected
    public Guid? ReviewedByUserId { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? DecisionNotes { get; set; }
}
