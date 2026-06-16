using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class Unit : BaseEntity
{
    // Nullable: some units (e.g. Maîtrise de Groupe) span both associations and belong to none.
    public Guid? AssociationId { get; set; }
    public Guid UnitTypeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;

    // Public website fields. The unit appears on the public site only when IsPublished.
    // (The public description lives on UnitType — shared by all units of the same category.)
    public string? Slug { get; set; }            // URL-friendly identifier for /unites/{slug}
    public bool IsPublished { get; set; }        // gate: false = hidden from the public site
    public DateOnly? FoundedDate { get; set; }   // actual founding date of the unit (not the system record date)

    public Association? Association { get; set; }
    public UnitType UnitType { get; set; } = null!;
    public ICollection<Team> Teams { get; set; } = [];
    public ICollection<MemberAssignment> Assignments { get; set; } = [];
}
