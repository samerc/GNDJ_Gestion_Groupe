using GNDJ.Application.Common.Interfaces;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Api.Services;

// Daily job that PERMANENTLY purges members soft-deleted more than `member.purge_after_days` ago (default 30):
// the member, their login and all connected data + files. Runs in its own DI scope; a failure on one run is
// logged and retried on the next interval — it can never take the app down.
public class MemberPurgeBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<MemberPurgeBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(2); // let startup migrations/seeding finish
    private const int DefaultRetentionDays = 30;

    public MemberPurgeBackgroundService(IServiceScopeFactory scopeFactory, ILogger<MemberPurgeBackgroundService> logger)
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
                var purge = scope.ServiceProvider.GetRequiredService<IMemberPurgeService>();
                var days = await GetRetentionDaysAsync(context, stoppingToken);
                await purge.PurgeExpiredAsync(days, stoppingToken);
            }
            catch (OperationCanceledException) { break; } // shutting down
            catch (Exception ex) { _logger.LogError(ex, "Member purge run failed; will retry next interval."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private static async Task<int> GetRetentionDaysAsync(GndjDbContext context, CancellationToken ct)
    {
        var val = await context.Settings.Where(s => s.Key == "member.purge_after_days")
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        return int.TryParse(val, out var d) && d > 0 ? d : DefaultRetentionDays;
    }
}
