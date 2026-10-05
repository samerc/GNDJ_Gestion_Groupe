using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Demandes;
using GNDJ.Infrastructure.Persistence;
using Mediator;

namespace GNDJ.Api.Services;

// Every minute: if the CG scheduled « Envoyer les réponses » and that moment (Lebanon time) has passed, runs the send
// (DemandeResponsesSchedule.RunDueAsync — same command as the button) and notifies the group managers of the result.
// Cheap when nothing is scheduled (one settings read).
public class DemandeResponsesSchedulerBackgroundService : BackgroundService
{
    private readonly IJobMonitor _jobs;
    private const string JobKey = "demande-responses-schedule";
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DemandeResponsesSchedulerBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(30); // let startup migrations/seeding finish

    public DemandeResponsesSchedulerBackgroundService(IServiceScopeFactory scopeFactory, ILogger<DemandeResponsesSchedulerBackgroundService> logger, IJobMonitor jobs)
    {
        _jobs = jobs;
        _jobs.Register(JobKey, "Envoi programmé des réponses aux demandes", Interval);
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
                var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
                var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
                var message = await DemandeResponsesSchedule.RunDueAsync(context, mediator, notifications, stoppingToken);
                if (message is not null) _logger.LogInformation("Scheduled demande responses: {Message}", message);
                _jobs.Succeeded(JobKey);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _jobs.Failed(JobKey, ex); _logger.LogError(ex, "Scheduled demande responses check failed; will retry next minute."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
