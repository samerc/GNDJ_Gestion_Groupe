using System.Net;
using System.Net.Mail;
using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
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
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IEmailQueue _emailQueue;
    private readonly IMemoryCache _cache;
    private readonly IConfiguration _config;
    private readonly ILogger<ErrorNotifier> _logger;

    // One alert per identical (source|path|message) signature per this window — throttles an error storm.
    private static readonly TimeSpan DedupeWindow = TimeSpan.FromMinutes(30);
    // Hard ceiling on alert emails per clock-hour (across all sources) — inbox-flood safety net.
    private const int MaxAlertsPerHour = 30;

    public ErrorNotifier(IServiceScopeFactory scopeFactory, IEmailQueue emailQueue, IMemoryCache cache,
        IConfiguration config, ILogger<ErrorNotifier> logger)
    {
        _scopeFactory = scopeFactory;
        _emailQueue = emailQueue;
        _cache = cache;
        _config = config;
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

            var recipient = await ResolveRecipientAsync(ct);
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
            if (!string.IsNullOrWhiteSpace(_config["ErrorAlerts:Smtp:Host"]))
            {
                // Fire-and-forget: never block the (already-failing) request on an SMTP round-trip.
                var rcpt = recipient!;
                _ = Task.Run(() => SendDirectSafeAsync(rcpt, report, source, timestamp));
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

    // Recipient priority: the admin-editable setting → appsettings fallback → the first active super-admin.
    // Read in a FRESH scope so we don't touch the (possibly faulted) request DbContext.
    private async Task<string?> ResolveRecipientAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();

            var setting = await db.Settings.Where(s => s.Key == "error.notify_email")
                .Select(s => s.Value).FirstOrDefaultAsync(ct);
            if (!string.IsNullOrWhiteSpace(setting)) return setting;

            var config = _config["ErrorAlerts:Email"];
            if (!string.IsNullOrWhiteSpace(config)) return config;

            return await db.Users.Where(u => u.IsSuperAdmin && u.IsActive)
                .Select(u => u.Email).FirstOrDefaultAsync(ct);
        }
        catch
        {
            // DB unreachable (a likely cause of the very error we're reporting) → fall back to config only.
            return _config["ErrorAlerts:Email"];
        }
    }

    // Send the alert directly via the dedicated ErrorAlerts SMTP (independent of the app's email system).
    // Wrapped so it never throws (fire-and-forget on the thread pool).
    private async Task SendDirectSafeAsync(string recipient, ErrorReport report, string source, string timestamp)
    {
        try
        {
            var host = _config["ErrorAlerts:Smtp:Host"]!;
            var port = int.TryParse(_config["ErrorAlerts:Smtp:Port"], out var p) ? p : 587;
            var user = _config["ErrorAlerts:Smtp:Username"];
            var pass = _config["ErrorAlerts:Smtp:Password"];
            var from = _config["ErrorAlerts:Smtp:From"] ?? user ?? "noreply@gndj.org";
            var useSsl = !bool.TryParse(_config["ErrorAlerts:Smtp:UseSsl"], out var s) || s; // default true (STARTTLS)

            string Row(string k, string v) => $"<tr><td style='padding:4px 8px;font-weight:bold'>{k}</td><td style='padding:4px 8px'>{WebUtility.HtmlEncode(v)}</td></tr>";
            var body =
                "<h2>Une erreur est survenue</h2><table style='border-collapse:collapse;font-family:monospace;font-size:13px'>" +
                Row("Référence", report.ErrorId) + Row("Origine", source) + Row("Date (UTC)", timestamp) +
                Row("Utilisateur", report.User ?? "anonyme") + Row("Requête", $"{report.Method} {report.Path}") +
                Row("Message", Truncate(report.Message, 500)) + "</table>" +
                "<p><strong>Détail :</strong></p><pre style='background:#f4f4f4;padding:10px;border-radius:5px;font-size:12px;white-space:pre-wrap'>" +
                WebUtility.HtmlEncode(Truncate(report.Detail ?? "", 3000)) + "</pre>";

            using var msg = new MailMessage
            {
                From = new MailAddress(from, "GNDJ Alertes"),
                Subject = $"[GNDJ Erreur {source}] réf. {report.ErrorId}",
                Body = body,
                IsBodyHtml = true,
            };
            msg.To.Add(recipient);

            using var client = new SmtpClient(host, port) { EnableSsl = useSsl };
            if (!string.IsNullOrWhiteSpace(user)) client.Credentials = new NetworkCredential(user, pass);
            await client.SendMailAsync(msg);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Direct error-alert send failed for ErrorId={ErrorId}", report.ErrorId);
        }
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? s : (s.Length <= max ? s : s[..max] + "…");
}
