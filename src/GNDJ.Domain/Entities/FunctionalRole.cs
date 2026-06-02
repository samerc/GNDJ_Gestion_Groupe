using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class FunctionalRole : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid SecurityProfileId { get; set; }
    public Guid? UnitTypeId { get; set; }

    public SecurityProfile SecurityProfile { get; set; } = null!;
    public UnitType? UnitType { get; set; }
    public ICollection<MemberAssignment> Assignments { get; set; } = [];
}
