using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

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
    public bool IsMaitrise { get; set; }

    public Unit Unit { get; set; } = null!;
    public ICollection<MemberAssignment> Assignments { get; set; } = [];
}
