namespace GNDJ.Domain.Entities;

public class SecurityProfilePermission
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public Guid SecurityProfileId { get; set; }
    public string Permission { get; set; } = string.Empty;

    public SecurityProfile SecurityProfile { get; set; } = null!;
}
