using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// One member's annual transition (passage) into the next scout year: a snapshot of the current placement,
// the CU's proposal, and the CG's final decision. Workflow Pending → Approved → Finalized (or Rejected).
// On finalize the old assignment is closed and a new one created (unless IsLeaving → member becomes alumni).
public class Passage : BaseEntity
{
    public string ScoutYear { get; set; } = string.Empty; // Year being transitioned INTO (e.g., "2026-2027")
    public Guid MemberId { get; set; }

    // Current assignment snapshot
    public Guid CurrentUnitId { get; set; }
    public Guid? CurrentTeamId { get; set; }
    public Guid CurrentRoleId { get; set; }

    // CU proposal
    public Guid ProposedUnitId { get; set; }
    public Guid? ProposedTeamId { get; set; }
    public Guid ProposedRoleId { get; set; }
    public string? CuNotes { get; set; }

    // "Quitte le groupe": on finalize, the active assignment is closed and NO new one is created
    // (member becomes alumni). When true the proposed/final unit+role are ignored.
    public bool IsLeaving { get; set; }

    // CG decision
    public Guid? FinalUnitId { get; set; }
    public Guid? FinalTeamId { get; set; }
    public Guid? FinalRoleId { get; set; }
    public string? CgNotes { get; set; }

    public string Status { get; set; } = Enums.PassageStatus.Pending;

    public Guid ProposedByUserId { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public DateTime? ReviewedAt { get; set; }

    // Navigation
    public Member Member { get; set; } = null!;
    public Unit CurrentUnit { get; set; } = null!;
    public Unit ProposedUnit { get; set; } = null!;
    public Unit? FinalUnit { get; set; }
    public FunctionalRole CurrentRole { get; set; } = null!;
    public FunctionalRole ProposedRole { get; set; } = null!;
    public FunctionalRole? FinalRole { get; set; }
}
