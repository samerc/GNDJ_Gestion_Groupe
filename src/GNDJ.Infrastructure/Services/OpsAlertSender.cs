using System.Net;
using System.Net.Mail;
using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Singleton. Owns its DB scope (the caller's may be faulted). See IOpsAlertSender.
public class OpsAlertSender : IOpsAlertSender
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IEmailQueue _emailQueue;
    private readonly IConfiguration _config;
    private readonly ILogger<OpsAlertSender> _logger;

    public OpsAlertSender(IServiceScopeFactory scopeFactory, IEmailQueue emailQueue, IConfiguration config,
        ILogger<OpsAlertSender> logger)
    {
        _scopeFactory = scopeFactory;
        _emailQueue = emailQueue;
        _config = config;
        _logger = logger;
    }

    public bool HasDedicatedSmtp => !string.IsNullOrWhiteSpace(_config["ErrorAlerts:Smtp:Host"]);

    public async Task<string?> ResolveRecipientAsync(CancellationToken ct = default)
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

            // Deterministic fallback: the OLDEST active super-admin (the seeded admin account).
            return await db.Users.Where(u => u.IsSuperAdmin && u.IsActive)
                .OrderBy(u => u.CreatedAt)
                .Select(u => u.Email).FirstOrDefaultAsync(ct);
        }
        catch
        {
            // DB unreachable (often the very problem being reported) → config only.
            return _config["ErrorAlerts:Email"];
        }
    }

    public async Task<bool> SendAsync(string subject, string htmlBody, string plainBody, CancellationToken ct = default)
    {
        try
        {
            var recipient = await ResolveRecipientAsync(ct);
            if (string.IsNullOrWhiteSpace(recipient))
            {
                _logger.LogWarning("Ops alert '{Subject}' not sent: no error.notify_email / ErrorAlerts:Email / super-admin.", subject);
                return false;
            }

            if (HasDedicatedSmtp)
                return await SendDirectAsync(recipient, subject, htmlBody);

            await _emailQueue.EnqueueAsync(new EmailJob("adhoc_message", recipient, new Dictionary<string, string>
            {
                ["subject"] = subject,
                ["body"] = plainBody,
                ["memberName"] = "",
            }), ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Ops alert '{Subject}' could not be sent", subject);
            return false;
        }
    }

    private async Task<bool> SendDirectAsync(string recipient, string subject, string htmlBody)
    {
        try
        {
            var host = _config["ErrorAlerts:Smtp:Host"]!;
            var port = int.TryParse(_config["ErrorAlerts:Smtp:Port"], out var p) ? p : 587;
            var user = _config["ErrorAlerts:Smtp:Username"];
            var pass = _config["ErrorAlerts:Smtp:Password"];
            var from = _config["ErrorAlerts:Smtp:From"] ?? user ?? "noreply@gndj.org";
            var useSsl = !bool.TryParse(_config["ErrorAlerts:Smtp:UseSsl"], out var s) || s; // default true (STARTTLS)

            using var msg = new MailMessage
            {
                From = new MailAddress(from, "GNDJ Alertes"),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true,
            };
            msg.To.Add(recipient);

            using var client = new SmtpClient(host, port) { EnableSsl = useSsl };
            if (!string.IsNullOrWhiteSpace(user)) client.Credentials = new NetworkCredential(user, pass);
            await client.SendMailAsync(msg);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Direct ops alert send failed ('{Subject}')", subject);
            return false;
        }
    }

    public static string Encode(string s) => WebUtility.HtmlEncode(s);
}
