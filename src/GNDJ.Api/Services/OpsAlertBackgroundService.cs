using System.Net;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.SystemHealth;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Api.Services;

// Daily "système" alert: every hour, compute the Système page's problem list (a background job stopped or failing,
// emails / pushes stuck or failing, low disk, configuration errors). When there is at least one problem, email the
// admin — at most ONE email per day (marker setting ops.alert_last_sent, Lebanon date). Sent through
// IOpsAlertSender, which prefers the dedicated alert SMTP (ErrorAlerts:Smtp), so the alert still gets out when the
// app's own email is what's broken.
public class OpsAlertBackgroundService : BackgroundService
{
    private readonly IJobMonitor _jobs;
    private const string JobKey = "ops-alert";
    public const string LastSentKey = "ops.alert_last_sent";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ISystemHealthService _health;
    private readonly IOpsAlertSender _sender;
    private readonly ILogger<OpsAlertBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    // Long enough that jobs have had a chance to run after a restart (so nothing reads as "stale" too early).
    // Monitoring:OpsAlertInitialDelaySeconds overrides it (tests).
    private readonly TimeSpan InitialDelay;

    public OpsAlertBackgroundService(IServiceScopeFactory scopeFactory, ISystemHealthService health, IOpsAlertSender sender,
        ILogger<OpsAlertBackgroundService> logger, IJobMonitor jobs, IConfiguration config)
    {
        InitialDelay = int.TryParse(config["Monitoring:OpsAlertInitialDelaySeconds"], out var sec) && sec >= 0
            ? TimeSpan.FromSeconds(sec) : TimeSpan.FromMinutes(20);
        _scopeFactory = scopeFactory;
        _health = health;
        _sender = sender;
        _logger = logger;
        _jobs = jobs;
        _jobs.Register(JobKey, "Alerte quotidienne « système »", Interval);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(InitialDelay, stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
                _jobs.Succeeded(JobKey);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _jobs.Failed(JobKey, ex); _logger.LogError(ex, "Ops alert run failed; will retry next interval."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
        var today = LebanonClock.Today.ToString("yyyy-MM-dd");
        var marker = await db.Settings.FirstOrDefaultAsync(s => s.Key == LastSentKey, ct);
        if (marker?.Value == today) return; // already alerted today

        var status = await _health.GetStatusAsync(ct);
        if (status.Problems.Count == 0) return;

        var items = string.Join("", status.Problems.Select(p => $"<li style='margin-bottom:6px'>{WebUtility.HtmlEncode(p)}</li>"));
        var html =
            "<h2 style='font-family:sans-serif'>GNDJ — points à vérifier</h2>" +
            $"<ul style='font-family:sans-serif;font-size:14px'>{items}</ul>" +
            "<p style='font-family:sans-serif;font-size:13px;color:#555'>Détails : Configuration → Système (super-administrateur). " +
            "Vous recevez au plus un email de ce type par jour.</p>";
        var plain = "GNDJ — points à vérifier :\n\n" + string.Join("\n", status.Problems.Select(p => "• " + p)) +
                    "\n\nDétails : Configuration → Système. Au plus un email de ce type par jour.";

        var sent = await _sender.SendAsync($"[GNDJ] {status.Problems.Count} point(s) à vérifier", html, plain, ct);
        if (!sent) return; // retry next hour

        if (marker is null)
            db.Settings.Add(new Setting { Key = LastSentKey, Value = today, Category = "maintenance", Label = "Dernière alerte système envoyée", ValueType = "string" });
        else marker.Value = today;
        await db.SaveChangesAsync(ct);
        _logger.LogWarning("Ops alert sent: {Count} problem(s): {Problems}", status.Problems.Count, string.Join(" | ", status.Problems));
    }
}
