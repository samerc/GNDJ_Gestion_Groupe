using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// How many NEW members a unit will accept for a given scout year (the demande intake quota).
// Soft target only — the CG can exceed it. One row per (unit, scout year).
public class UnitIntakeQuota : BaseEntity
{
    public Guid UnitId { get; set; }
    public string ScoutYear { get; set; } = string.Empty;
    public int Quota { get; set; }

    public Unit Unit { get; set; } = null!;
}
