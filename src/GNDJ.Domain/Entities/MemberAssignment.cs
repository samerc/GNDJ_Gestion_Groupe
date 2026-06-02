using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class MemberAssignment : BaseEntity
{
    public Guid MemberId { get; set; }
    public Guid UnitId { get; set; }
    public Guid? TeamId { get; set; }
    public Guid FunctionalRoleId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public string? Notes { get; set; }

    public Member Member { get; set; } = null!;
    public Unit Unit { get; set; } = null!;
    public Team? Team { get; set; }
    public FunctionalRole FunctionalRole { get; set; } = null!;
}
