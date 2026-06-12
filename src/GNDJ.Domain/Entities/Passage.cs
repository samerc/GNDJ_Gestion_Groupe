using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

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
