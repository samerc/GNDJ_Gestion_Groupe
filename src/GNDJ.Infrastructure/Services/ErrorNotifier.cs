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

            var recipient = await ResolveRecipientAsync(ct);
            if (string.IsNullOrWhiteSpace(recipient))
            {
                // Nowhere configured to send — the error is still in the logs (application_logs). Note it once.
                _logger.LogWarning("Error alert not sent (no error.notify_email / ErrorAlerts:Email configured). ErrorId={ErrorId}", report.ErrorId);
                return;
            }

            var vars = new Dictionary<string, string>
            {
                ["errorId"] = report.ErrorId,
                ["source"] = report.Source == "client" ? "Application (navigateur)" : "Serveur",
                ["timestamp"] = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss 'UTC'"),
                ["message"] = Truncate(report.Message, 500),
                // EmailService HTML-encodes every substituted value for the body, so pass the raw trace here.
                ["detail"] = Truncate(report.Detail ?? "", 3000),
                ["method"] = report.Method ?? "",
                ["path"] = report.Path ?? "",
                ["user"] = report.User ?? "anonyme",
            };
            _emailQueue.Enqueue(new EmailJob("error_alert", recipient!, vars));
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

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? s : (s.Length <= max ? s : s[..max] + "…");
}
