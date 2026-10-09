using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Demandes;
using GNDJ.Application.Passages;
using GNDJ.Infrastructure.Persistence;
using Mediator;

namespace GNDJ.Api.Services;

// Every minute: runs whatever the CG scheduled for a date and time (Lebanon) whose moment has passed —
// « Envoyer les réponses » (demandes) and « Publier le passage » — via the same commands as the buttons, then
// notifies the group managers of the result (Common/ScheduledRun). Cheap when nothing is scheduled (a settings read
// each). Each action is checked independently, so a failure in one never blocks the other.
public class ScheduledRunsBackgroundService : BackgroundService
{
    private readonly IJobMonitor _jobs;
    private const string JobKey = "scheduled-runs";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ScheduledRunsBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(30); // let startup migrations/seeding finish

    private delegate Task<string?> Runner(GndjDbContext context, IMediator mediator, INotificationService notifications, CancellationToken ct);

    private static readonly (string Name, Runner Run)[] Actions =
    [
        ("réponses aux demandes", (c, m, n, ct) => DemandeResponsesSchedule.RunDueAsync(c, m, n, ct)),
        ("publication du passage", (c, m, n, ct) => PassageFinalizeSchedule.RunDueAsync(c, m, n, ct)),
    ];

    public ScheduledRunsBackgroundService(IServiceScopeFactory scopeFactory, ILogger<ScheduledRunsBackgroundService> logger, IJobMonitor jobs)
    {
        _jobs = jobs;
        _jobs.Register(JobKey, "Actions programmées (réponses aux demandes, passage)", Interval);
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(InitialDelay, stoppingToken); }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            Exception? failure = null;
            foreach (var (name, run) in Actions)
            {
                try
                {
                    // A fresh scope per action: a failed one never leaves a dirty DbContext for the next.
                    using var scope = _scopeFactory.CreateScope();
                    var context = scope.ServiceProvider.GetRequiredService<GndjDbContext>();
                    var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
                    var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
                    var message = await run(context, mediator, notifications, stoppingToken);
                    if (message is not null) _logger.LogInformation("Scheduled {Action}: {Message}", name, message);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
                catch (Exception ex) { failure = ex; _logger.LogError(ex, "Scheduled {Action} check failed; will retry next minute.", name); }
            }
            if (failure is null) _jobs.Succeeded(JobKey); else _jobs.Failed(JobKey, failure);

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
