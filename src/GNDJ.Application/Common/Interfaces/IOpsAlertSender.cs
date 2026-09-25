namespace GNDJ.Application.Common.Interfaces;

// Sends an operations alert to the admin (error alerts, the daily "système" digest). Shared by ErrorNotifier and
// the ops-alert job so both resolve the recipient and pick the delivery route the same way.
public interface IOpsAlertSender
{
    // Recipient priority: setting error.notify_email → config ErrorAlerts:Email → the oldest active super-admin.
    Task<string?> ResolveRecipientAsync(CancellationToken ct = default);

    // Delivers via the dedicated alert SMTP (ErrorAlerts:Smtp:*) when configured — works even when the app's own
    // email is broken — else through the email outbox with the "adhoc_message" template (plainBody). Never throws;
    // returns false when nothing could be sent (no recipient / send failed).
    Task<bool> SendAsync(string subject, string htmlBody, string plainBody, CancellationToken ct = default);

    bool HasDedicatedSmtp { get; }
}
