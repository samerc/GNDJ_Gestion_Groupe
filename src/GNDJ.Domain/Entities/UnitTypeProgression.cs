using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class UnitTypeProgression : BaseEntity
{
    public Guid AssociationId { get; set; }
    public Guid FromUnitTypeId { get; set; }
    public Guid ToUnitTypeId { get; set; }
    public string? Gender { get; set; } // null = both, "Masculin", "Féminin"
    public string PathType { get; set; } = "member"; // "member" or "leader"
    public int DisplayOrder { get; set; }
    public string? Notes { get; set; }

    // Navigation
    public Association Association { get; set; } = null!;
    public UnitType FromUnitType { get; set; } = null!;
    public UnitType ToUnitType { get; set; } = null!;
}
