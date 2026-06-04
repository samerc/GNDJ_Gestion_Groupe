using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class EmailTemplate : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Module { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string BodyHtml { get; set; } = string.Empty;
    public string? Variables { get; set; }
    public Guid? SmtpServerId { get; set; }
    public bool IsActive { get; set; } = true;

    public SmtpServer? SmtpServer { get; set; }
}
