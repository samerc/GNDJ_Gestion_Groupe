using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class Association : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }

    public ICollection<Unit> Units { get; set; } = [];
}
