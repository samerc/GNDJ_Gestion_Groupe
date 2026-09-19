using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A badge selected on a badge-stage progression. Normally scoped to a unit type, but UnitTypeId may be NULL =
// a GLOBAL badge available to EVERY unit type (pickable regardless of the member's unit). Archived = IsActive false.
public class Badge : BaseEntity
{
    public Guid? UnitTypeId { get; set; } // null = global (all unit types)
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public UnitType? UnitType { get; set; } // null for a global badge
    public ICollection<MemberProgression> Progressions { get; set; } = [];
}
