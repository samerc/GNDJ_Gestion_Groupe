using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A badge awardable within a unit type, selected on a badge-stage progression. Archived = IsActive false.
public class Badge : BaseEntity
{
    public Guid UnitTypeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public UnitType UnitType { get; set; } = null!;
    public ICollection<MemberProgression> Progressions { get; set; } = [];
}
