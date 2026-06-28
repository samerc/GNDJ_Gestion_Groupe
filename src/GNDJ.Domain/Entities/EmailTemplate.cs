using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// An editable email template (looked up by Code, e.g. "password_reset"). {{variables}} in Subject/BodyHtml
// are substituted at send time (HTML-encoded in the body). Module groups templates + scopes the variable list.
public class EmailTemplate : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Module { get; set; } = string.Empty; // EmailTemplateModules: auth, documents, cotisations, passage…
    public string Subject { get; set; } = string.Empty;
    public string BodyHtml { get; set; } = string.Empty;
    public string? Variables { get; set; } // JSON list of the placeholders this template supports
    public Guid? SmtpServerId { get; set; } // null = use the active SMTP server
    public bool IsActive { get; set; } = true;

    public SmtpServer? SmtpServer { get; set; }
}
