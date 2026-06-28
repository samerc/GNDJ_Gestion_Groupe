using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A named permission bundle (super-admin, chef-unite, chef-de-groupe, read-only…) attached to functional roles.
// IsSystem profiles are seeded and protected from deletion. The actual grants live in Permissions.
public class SecurityProfile : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsSystem { get; set; }
    // Group-level profile (e.g. Chef de Groupe): its holders see ALL units (group-wide scope),
    // like a super admin, without the super-admin flag. Set via seeded system profiles only.
    public bool IsGroupLevel { get; set; }

    public ICollection<SecurityProfilePermission> Permissions { get; set; } = [];
    public ICollection<FunctionalRole> FunctionalRoles { get; set; } = [];
}
