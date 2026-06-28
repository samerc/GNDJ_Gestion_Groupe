using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// An edge in the group's "parcours scout" graph: a member of FromUnitType normally moves up to ToUnitType
// (by gender). Drives the progression diagram and the passage destination suggestions. Group-wide (association null).
public class UnitTypeProgression : BaseEntity
{
    public Guid? AssociationId { get; set; } // null = group-wide (paths are distinguished by gender, not association)
    public Guid FromUnitTypeId { get; set; }
    public Guid ToUnitTypeId { get; set; }
    public string? Gender { get; set; } // null = both, "Masculin", "Féminin"
    public string PathType { get; set; } = "member"; // "member" or "leader"
    public int DisplayOrder { get; set; }
    public string? Notes { get; set; }

    // Navigation
    public Association? Association { get; set; }
    public UnitType FromUnitType { get; set; } = null!;
    public UnitType ToUnitType { get; set; } = null!;
}
