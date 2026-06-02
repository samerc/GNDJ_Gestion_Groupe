using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class SecurityProfile : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsSystem { get; set; }

    public ICollection<SecurityProfilePermission> Permissions { get; set; } = [];
    public ICollection<FunctionalRole> FunctionalRoles { get; set; } = [];
}
