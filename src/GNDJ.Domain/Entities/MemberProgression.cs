using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// Records that a member reached a ScoutStage (optionally earning a Badge) on a date — their progression history.
public class MemberProgression : BaseEntity
{
    public Guid MemberId { get; set; }
    public Guid UnitId { get; set; }
    public Guid ScoutStageId { get; set; }
    public Guid? BadgeId { get; set; } // Only when the stage is a badge stage
    public DateOnly Date { get; set; }
    public string? Location { get; set; }
    public string? Notes { get; set; }

    public Member Member { get; set; } = null!;
    public Unit Unit { get; set; } = null!;
    public ScoutStage ScoutStage { get; set; } = null!;
    public Badge? Badge { get; set; }
}
