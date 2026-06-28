using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// An outgoing-mail (SMTP) configuration. EmailTemplates reference one; the active server is used to send.
// NOTE: Password is stored in plaintext for now (flagged to encrypt/externalize for production).
public class SmtpServer : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FromEmail { get; set; } = string.Empty;
    public string FromName { get; set; } = string.Empty;
    public bool UseSsl { get; set; } = true;
    public bool IsActive { get; set; } = true;
}
