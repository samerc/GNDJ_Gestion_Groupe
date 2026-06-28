using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A sub-group within a Unit (sizaine / patrouille / équipe). Identified by a Totem (+ Adjective)
// and two colours. The maîtrise (leaders) team is flagged and always sorted first.
public class Team : BaseEntity
{
    public Guid UnitId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Totem { get; set; }
    public string? Adjective { get; set; }
    public string? Color1 { get; set; }
    public string? Color2 { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsMaitrise { get; set; } // the unit's leaders team — pinned first in rosters/trombinoscope

    public Unit Unit { get; set; } = null!;
    public ICollection<MemberAssignment> Assignments { get; set; } = [];
}
