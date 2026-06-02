using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class Unit : BaseEntity
{
    public Guid AssociationId { get; set; }
    public Guid UnitTypeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;

    public Association Association { get; set; } = null!;
    public UnitType UnitType { get; set; } = null!;
    public ICollection<Team> Teams { get; set; } = [];
    public ICollection<MemberAssignment> Assignments { get; set; } = [];
}
