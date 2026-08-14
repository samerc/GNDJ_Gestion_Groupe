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

    // Optional per-provider send-rate cap (emails/hour). NULL = unlimited (the default, no throttling).
    // Set it to respect a provider's free-tier ceiling (e.g. SendPulse free = 50/hr → set ~45 for margin):
    // the outbox sender then spaces this server's sends at least 3600/MaxPerHour seconds apart so a large
    // enqueue (e.g. the whole-group activation blast) trickles out cleanly instead of tripping the provider's
    // rate limit and piling up as Failed retries. See OutboxSenderBackgroundService.
    public int? MaxPerHour { get; set; }
}
