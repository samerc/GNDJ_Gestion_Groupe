using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Entities;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Api.Services;

// Daily maintenance for tables that would otherwise grow unbounded. All jobs are self-healing (a missing table
// / setting is simply skipped) and run in one DI scope; a failure is logged and retried next interval — it can
// never take the app down.
//   1. Serilog's `application_logs` (Warning+ sink, auto-created by the PostgreSQL sink, no migration owns it):
//      ensure a `timestamp DESC` index (the sink creates none, so the error-journal ORDER BY is a full scan +
//      sort), and delete rows older than `logs.retention_days` (default 90).
//   2. `notifications`: delete READ notifications older than `notifications.retention_days` (default 90). Every
//      in-app notification writes a row per recipient (+ a push mirror) and there was no cleanup — unbounded.
//      Unread notifications are kept (still actionable).
//   3. `email_outbox` + `push_outbox`: delete Sent/Failed rows older than `outbox.retention_days` (default 30).
//      Send records accumulate forever (only a manual "Vider les envoyés" existed); Pending rows are kept.
public class ApplicationLogMaintenanceBackgroundService : BackgroundService
{
    private readonly IJobMonitor _jobs;
    private const string JobKey = "log-maintenance";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ApplicationLogMaintenanceBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(3); // let startup migrations/seeding finish
    private const int DefaultRetentionDays = 90;
    private const int DefaultNotificationRetentionDays = 90;
    private const int DefaultOutboxRetentionDays = 30;

    public ApplicationLogMaintenanceBackgroundService(IServiceScopeFactory scopeFactory, ILogger<ApplicationLogMaintenanceBackgroundService> logger, IJobMonitor jobs)
    {
        _jobs = jobs;
        _jobs.Register(JobKey, "Nettoyage quotidien (journaux, notifications, envois)", TimeSpan.FromHours(24));
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(InitialDelay, stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<GndjDbContext>();

                var days = await GetRetentionDaysAsync(context, stoppingToken);

                // One guarded statement: if the sink has created the table, ensure the index and prune old rows.
                // The days value is a validated int we interpolate (DO blocks can't take parameters); the SQL has
                // no `{` so ExecuteSqlRaw's format-parsing is a no-op. CREATE INDEX IF NOT EXISTS is a cheap no-op
                // once built. DELETE only runs when retention > 0.
                var deleteClause = days > 0
                    ? $"DELETE FROM application_logs WHERE timestamp < now() - make_interval(days => {days});"
                    : string.Empty;
                var sql = $@"
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'application_logs') THEN
    CREATE INDEX IF NOT EXISTS ix_application_logs_timestamp ON application_logs (timestamp DESC);
    {deleteClause}
  END IF;
END $$;";
                await context.Database.ExecuteSqlRawAsync(sql, stoppingToken);

                // 2. Notifications: prune READ ones past retention (unread kept — still actionable).
                var notifDays = await GetIntSettingAsync(context, "notifications.retention_days", DefaultNotificationRetentionDays, stoppingToken);
                if (notifDays > 0)
                {
                    var cutoff = DateTime.UtcNow.AddDays(-notifDays);
                    await context.Notifications
                        .Where(n => n.IsRead && n.CreatedAt < cutoff)
                        .ExecuteDeleteAsync(stoppingToken);
                }

                // 3. Outbox (email + push): prune Sent/Failed rows past retention (Pending kept). Keyed on
                //    CreatedAt (present on every row; Failed rows may have a null SentAt).
                var outboxDays = await GetIntSettingAsync(context, "outbox.retention_days", DefaultOutboxRetentionDays, stoppingToken);
                if (outboxDays > 0)
                {
                    var cutoff = DateTime.UtcNow.AddDays(-outboxDays);
                    await context.OutboxEmails
                        .Where(e => (e.Status == OutboxEmailStatus.Sent || e.Status == OutboxEmailStatus.Failed) && e.CreatedAt < cutoff)
                        .ExecuteDeleteAsync(stoppingToken);
                    await context.PushOutbox
                        .Where(p => (p.Status == PushOutboxStatus.Sent || p.Status == PushOutboxStatus.Failed) && p.CreatedAt < cutoff)
                        .ExecuteDeleteAsync(stoppingToken);
                }
                _jobs.Succeeded(JobKey);
            }
            catch (OperationCanceledException) { break; } // shutting down
            catch (Exception ex) { _jobs.Failed(JobKey, ex); _logger.LogError(ex, "Application-log maintenance run failed; will retry next interval."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private static async Task<int> GetRetentionDaysAsync(GndjDbContext context, CancellationToken ct)
    {
        var val = await context.Settings.Where(s => s.Key == "logs.retention_days")
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        return int.TryParse(val, out var d) && d > 0 ? d : DefaultRetentionDays;
    }

    // Reads an int setting. An explicit "0" is respected (returned as 0 → caller treats it as "disabled");
    // an absent or non-numeric value falls back to the default.
    private static async Task<int> GetIntSettingAsync(GndjDbContext context, string key, int fallback, CancellationToken ct)
    {
        var val = await context.Settings.Where(s => s.Key == key)
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        return int.TryParse(val, out var d) && d >= 0 ? d : fallback;
    }
}
