using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Members;
using GNDJ.Infrastructure.Persistence;

namespace GNDJ.Api.Services;

// Hourly job: finds members who were just given a leadership (maîtrise) role and queues their "Bienvenue dans la
// maîtrise" email once (see LeaderWelcome). A failed run is logged + retried at the next interval.
public class LeaderWelcomeBackgroundService : BackgroundService
{
    private readonly IJobMonitor _jobs;
    private const string JobKey = "leader-welcome";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<LeaderWelcomeBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(5); // let startup migrations/seeding finish

    public LeaderWelcomeBackgroundService(IServiceScopeFactory scopeFactory, ILogger<LeaderWelcomeBackgroundService> logger, IJobMonitor jobs)
    {
        _jobs = jobs;
        _jobs.Register(JobKey, "Bienvenue aux nouveaux chefs", TimeSpan.FromHours(1));
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
                var emailQueue = scope.ServiceProvider.GetRequiredService<IEmailQueue>();
                var sent = await LeaderWelcome.RunAsync(context, emailQueue, stoppingToken);
                if (sent > 0) _logger.LogInformation("Leader welcome: queued {Count} email(s).", sent);
                _jobs.Succeeded(JobKey);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _jobs.Failed(JobKey, ex); _logger.LogError(ex, "Leader welcome run failed; will retry next interval."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
