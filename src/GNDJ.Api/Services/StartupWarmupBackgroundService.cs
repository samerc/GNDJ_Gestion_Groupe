using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Demandes;

namespace GNDJ.Api.Services;

// Runs ONCE shortly after startup: pre-runs the heaviest authenticated page queries (the demandes review list)
// so EF query compilation + JIT happen before the first real user. IIS AppInit (web.config) can only warm
// anonymous URLs, so this covers what it can't. Best-effort: a failure is logged and ignored. Not registered with
// the job monitor (a one-off would show as "stale").
public class StartupWarmupBackgroundService(IServiceScopeFactory scopeFactory, ILogger<StartupWarmupBackgroundService> logger) : BackgroundService
{
    // Let startup migrations/seeders and IIS AppInit finish first.
    private static readonly TimeSpan Delay = TimeSpan.FromSeconds(20);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(Delay, stoppingToken);
            var started = DateTime.UtcNow;
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
            await DemandeReviewList.WarmUpAsync(db, stoppingToken);
            logger.LogInformation("Startup warm-up done in {Ms} ms", (int)(DateTime.UtcNow - started).TotalMilliseconds);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { logger.LogInformation(ex, "Startup warm-up skipped"); }
    }
}
