namespace GNDJ.Domain.Entities;

// One permission grant for a profile (join row). Permission is a string key from Permissions.All.
// Not a BaseEntity — no soft-delete/audit needed; rows are replaced wholesale when a profile is edited.
public class SecurityProfilePermission
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid SecurityProfileId { get; set; }
    public string Permission { get; set; } = string.Empty;

    public SecurityProfile SecurityProfile { get; set; } = null!;
}
