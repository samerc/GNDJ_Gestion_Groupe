using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Api.Services;

// Daily maintenance for Serilog's `application_logs` table (Warning+ sink, auto-created by the PostgreSQL sink,
// so EF never manages it — no migration owns it). Two jobs, both self-healing so a fresh DB where the table
// doesn't exist yet is simply skipped until it appears:
//   1. Ensure a `timestamp DESC` index exists. The Serilog sink creates the table with NO index, so the
//      super-admin error-journal query (ORDER BY timestamp DESC + level filter) is a full scan + sort, and the
//      ever-growing unindexed table bloats shared_buffers/OS cache for the WHOLE shared box.
//   2. Delete rows older than `logs.retention_days` (default 90). There was no retention — only a manual
//      "Vider le journal" button — so the table grew unbounded.
// Runs in its own DI scope; a failure is logged and retried next interval — it can never take the app down.
public class ApplicationLogMaintenanceBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ApplicationLogMaintenanceBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(3); // let startup migrations/seeding finish
    private const int DefaultRetentionDays = 90;

    public ApplicationLogMaintenanceBackgroundService(IServiceScopeFactory scopeFactory, ILogger<ApplicationLogMaintenanceBackgroundService> logger)
    {
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
            }
            catch (OperationCanceledException) { break; } // shutting down
            catch (Exception ex) { _logger.LogError(ex, "Application-log maintenance run failed; will retry next interval."); }

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
}
