using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// One member's annual transition (passage) into the next scout year: a snapshot of the current placement,
// the CU's proposal, and the CG's final decision. Workflow Pending → Approved → Finalized. The CG never
// rejects a line: if they disagree they change it (Final* / FinalIsLeaving + a reason in CgNotes). Lines that
// stay in the same unit (or leave the group) are accepted automatically. Posting ("finalize") is group-wide;
// it accepts any line still Pending, closes the old assignment and creates the new one (unless leaving).
// (Rejected is legacy — no longer produced.)
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
    public string? CgNotes { get; set; } // optional reason for the CG's change — shown to the CU
    // The CG's decision on "quitte le groupe" when it differs from the CU's (null = same as IsLeaving).
    // Effective departure = FinalIsLeaving ?? IsLeaving.
    public bool? FinalIsLeaving { get; set; }
    // True when the CG's decision differs from the CU's proposal: the CU can no longer edit the line.
    public bool CgModified { get; set; }

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
