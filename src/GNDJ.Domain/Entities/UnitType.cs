using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class UnitType : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? NumberOfYears { get; set; }
    public int? AgeMin { get; set; }
    public int? AgeMax { get; set; }
    public string? Color { get; set; } // hex color e.g. "#3B82F6"
    public string? Gender { get; set; } // Masculin | Féminin | Mixte — drives demande eligibility
    public string? PublicDescription { get; set; } // shown on the public site for all units of this type

    public ICollection<Unit> Units { get; set; } = [];
    public ICollection<FunctionalRole> FunctionalRoles { get; set; } = [];
}
