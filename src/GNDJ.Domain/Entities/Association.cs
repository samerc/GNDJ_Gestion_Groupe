using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// Top-level org division (e.g. SDL / GDL). Owns Units. A Unit's association is nullable — some units
// (Maîtrise de Groupe) span both associations and belong to none.
public class Association : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }

    public ICollection<Unit> Units { get; set; } = [];
}
