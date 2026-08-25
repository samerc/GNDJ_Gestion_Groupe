using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A role a member can hold within a unit type (Louveteau, Chef d'unité, Aumônier…). Binds a SecurityProfile
// (its permissions) and drives display ordering. A null UnitTypeId = a global/cross-type role.
public class FunctionalRole : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Rank { get; set; } // display ordering within a unit type (higher = more senior; set by drag)
    public bool IsArchived { get; set; } // hidden from pickers but kept (still shown on members who hold it)
    public bool IsMaitrise { get; set; } // leadership function — its holders appear on the Maîtrises page
    public bool IsTeamLeader { get; set; } // chef d'équipe — its holder leads their team (fills its réunions/absences)
    public bool IsDefaultForNewMembers { get; set; } // the role auto-assigned to members admitted from a demande (one per unit type)
    public Guid SecurityProfileId { get; set; }
    public Guid? UnitTypeId { get; set; }

    public SecurityProfile SecurityProfile { get; set; } = null!;
    public UnitType? UnitType { get; set; }
    public ICollection<MemberAssignment> Assignments { get; set; } = [];
}
