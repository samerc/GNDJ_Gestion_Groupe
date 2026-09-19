using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// An ordered progression step (an étape). Normally scoped to a unit type, but UnitTypeId may be NULL =
// a GLOBAL stage available to EVERY unit type (a cross-branch item pickable regardless of the member's unit).
// When IsBadgeStage, a progression at this stage must also pick a Badge. Archived = IsActive false (hidden from
// pickers, kept on members who hold it).
public class ScoutStage : BaseEntity
{
    public Guid? UnitTypeId { get; set; } // null = global (all unit types)
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsBadgeStage { get; set; } // When true, a badge must be selected

    public UnitType? UnitType { get; set; } // null for a global stage
    public ICollection<MemberProgression> Progressions { get; set; } = [];
}
