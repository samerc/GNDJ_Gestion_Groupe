using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// Places a member in a unit (+ optional team) with a functional role for a date range. The core record
// behind unit-scoped access and roster membership. EndDate == null means the assignment is ACTIVE (current);
// a non-null EndDate is history. A member may have several over time (one per scout year after the split).
public class MemberAssignment : BaseEntity
{
    public Guid MemberId { get; set; }
    public Guid UnitId { get; set; }
    public Guid? TeamId { get; set; } // null = in the unit but not yet placed in a team
    public Guid FunctionalRoleId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; } // null = active/current; set = ended (alumni for this unit)
    public string? Notes { get; set; }

    public Member Member { get; set; } = null!;
    public Unit Unit { get; set; } = null!;
    public Team? Team { get; set; }
    public FunctionalRole FunctionalRole { get; set; } = null!;
}
