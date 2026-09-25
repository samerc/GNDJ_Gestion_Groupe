using System.Net;
using GNDJ.Application.Common.Interfaces;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Emails the super-admin when something breaks, so they can act on it. Registered as a SINGLETON: it owns
// no request state and creates its own DbContext scope (the failing request's scope may be faulted). It is
// best-effort — every path is wrapped so a notification failure can NEVER surface to the user or mask the
// original error. Deduped via IMemoryCache so a repeating incident sends ONE email per signature per window
// (not one per occurrence). Delivery uses the app's email queue/SMTP, so it honours email.override_recipient
// during testing and only actually sends once an SMTP server is active.
public class ErrorNotifier : IErrorNotifier
{
    private readonly IEmailQueue _emailQueue;
    private readonly IMemoryCache _cache;
    private readonly IOpsAlertSender _ops;
    private readonly ILogger<ErrorNotifier> _logger;

    // One alert per identical (source|path|message) signature per this window — throttles an error storm.
    private static readonly TimeSpan DedupeWindow = TimeSpan.FromMinutes(30);
    // Hard ceiling on alert emails per clock-hour (across all sources) — inbox-flood safety net.
    private const int MaxAlertsPerHour = 30;

    public ErrorNotifier(IEmailQueue emailQueue, IMemoryCache cache, IOpsAlertSender ops, ILogger<ErrorNotifier> logger)
    {
        _emailQueue = emailQueue;
        _cache = cache;
        _ops = ops;
        _logger = logger;
    }

    public async Task NotifyAsync(ErrorReport report, CancellationToken ct = default)
    {
        try
        {
            // Dedupe: collapse repeated identical errors into one email per window.
            var signature = $"errnotify:{report.Source}|{report.Path}|{Truncate(report.Message, 120)}";
            if (_cache.TryGetValue(signature, out _)) return;
            _cache.Set(signature, true, DedupeWindow);

            // Global circuit-breaker: cap TOTAL alerts per clock-hour so neither a diverse error storm nor an
            // authenticated abuser varying the message (which bypasses the per-signature dedupe) can flood the
            // inbox. Beyond the cap the error is still logged/visible in the journal; only the email is skipped.
            var bucket = $"errnotify:count:{DateTime.UtcNow:yyyyMMddHH}";
            var sentThisHour = _cache.TryGetValue(bucket, out int c) ? c : 0;
            if (sentThisHour >= MaxAlertsPerHour)
            {
                _logger.LogWarning("Error-alert hourly cap ({Cap}) reached; suppressing email for ErrorId={ErrorId}", MaxAlertsPerHour, report.ErrorId);
                return;
            }
            _cache.Set(bucket, sentThisHour + 1, TimeSpan.FromHours(2));

            var recipient = await _ops.ResolveRecipientAsync(ct);
            if (string.IsNullOrWhiteSpace(recipient))
            {
                // Nowhere configured to send — the error is still in the logs (application_logs). Note it once.
                _logger.LogWarning("Error alert not sent (no error.notify_email / ErrorAlerts:Email configured). ErrorId={ErrorId}", report.ErrorId);
                return;
            }

            var source = report.Source == "client" ? "Application (navigateur)" : "Serveur";
            var timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss 'UTC'");

            // Prefer a DEDICATED alert SMTP (appsettings ErrorAlerts:Smtp:*) so error alerts work independently
            // of the member-facing email system — i.e. even before email go-live, and never redirected by
            // email.override_recipient. This mirrors the always-on ops scripts (SMTP2GO). If not configured,
            // fall back to the normal templated email queue (delivers once the app's SMTP is active).
            if (_ops.HasDedicatedSmtp)
            {
                // Fire-and-forget: never block the (already-failing) request on an SMTP round-trip.
                var html = BuildHtml(report, source, timestamp);
                _ = Task.Run(() => _ops.SendAsync($"[GNDJ Erreur {source}] réf. {report.ErrorId}", html, report.Message));
            }
            else
            {
                var vars = new Dictionary<string, string>
                {
                    ["errorId"] = report.ErrorId,
                    ["source"] = source,
                    ["timestamp"] = timestamp,
                    ["message"] = Truncate(report.Message, 500),
                    // EmailService HTML-encodes every substituted value for the body, so pass the raw trace here.
                    ["detail"] = Truncate(report.Detail ?? "", 3000),
                    ["method"] = report.Method ?? "",
                    ["path"] = report.Path ?? "",
                    ["user"] = report.User ?? "anonyme",
                };
                await _emailQueue.EnqueueAsync(new EmailJob("error_alert", recipient!, vars), ct);
            }
        }
        catch (Exception ex)
        {
            // Never let alerting throw — just note it and move on.
            _logger.LogWarning(ex, "Failed to queue error alert for ErrorId={ErrorId}", report.ErrorId);
        }
    }

    // Body of the direct (alert-SMTP) error email.
    private static string BuildHtml(ErrorReport report, string source, string timestamp)
    {
        string Row(string k, string v) => $"<tr><td style='padding:4px 8px;font-weight:bold'>{k}</td><td style='padding:4px 8px'>{WebUtility.HtmlEncode(v)}</td></tr>";
        return
            "<h2>Une erreur est survenue</h2><table style='border-collapse:collapse;font-family:monospace;font-size:13px'>" +
            Row("Référence", report.ErrorId) + Row("Origine", source) + Row("Date (UTC)", timestamp) +
            Row("Utilisateur", report.User ?? "anonyme") + Row("Requête", $"{report.Method} {report.Path}") +
            Row("Message", Truncate(report.Message, 500)) + "</table>" +
            "<p><strong>Détail :</strong></p><pre style='background:#f4f4f4;padding:10px;border-radius:5px;font-size:12px;white-space:pre-wrap'>" +
            WebUtility.HtmlEncode(Truncate(report.Detail ?? "", 3000)) + "</pre>";
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? s : (s.Length <= max ? s : s[..max] + "…");
}
