using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// An ordered progression step within a unit type (an étape). When IsBadgeStage, a progression at this stage
// must also pick a Badge. Archived = IsActive false (hidden from pickers, kept on members who hold it).
public class ScoutStage : BaseEntity
{
    public Guid UnitTypeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsBadgeStage { get; set; } // When true, a badge must be selected

    public UnitType UnitType { get; set; } = null!;
    public ICollection<MemberProgression> Progressions { get; set; } = [];
}
