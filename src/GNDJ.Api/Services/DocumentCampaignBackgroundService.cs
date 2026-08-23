using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Documents;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Api.Services;

// Daily job that advances the document-verification campaign at its two transition dates:
//   • correction_start : if verification is done (no docs left pending group-wide) → send the error emails;
//                        else alert the Chef de Groupe (once) that verification isn't finished.
//   • final_deadline   : if verification is done → put every still-incomplete dossier on hold + email them;
//                        else alert the CG (once).
// Each action is stamped with the campaign's scout year (idempotency markers) so it fires ONCE per campaign;
// the CG's manual buttons run the exact same DocumentCampaignActions. Upload open/closed itself is computed
// on read (no job needed) — this service only handles the emails + on-hold. A failed run is logged and retried.
public class DocumentCampaignBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DocumentCampaignBackgroundService> _logger;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(12);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(3); // let startup migrations/seeding finish

    public DocumentCampaignBackgroundService(IServiceScopeFactory scopeFactory, ILogger<DocumentCampaignBackgroundService> logger)
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
                var emailQueue = scope.ServiceProvider.GetRequiredService<IEmailQueue>();
                await RunOnceAsync(context, emailQueue, stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { _logger.LogError(ex, "Document campaign run failed; will retry next interval."); }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunOnceAsync(IApplicationDbContext context, IEmailQueue emailQueue, CancellationToken ct)
    {
        var status = await DocumentCampaign.LoadAsync(context, ct);
        // Only when the campaign is enabled + properly configured (dates set/ordered) + has a scout year.
        if (!status.Enabled || status.Phase == DocumentCampaignPhases.Inactive || string.IsNullOrWhiteSpace(status.ScoutYear))
            return;
        var year = status.ScoutYear;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // ── Step 1 (correction_start): error emails ──
        if (status.CorrectionStart is { } cs && today >= cs)
        {
            var errorsSentFor = await DocumentCampaignActions.GetSettingAsync(context, DocumentCampaignKeys.ErrorsSentFor, ct);
            if (errorsSentFor != year)
            {
                var pending = await DocumentCampaignActions.PendingReviewCountAsync(context, ct);
                if (pending == 0)
                {
                    var report = await DocumentCampaignActions.RunSendErrorsAsync(context, emailQueue, year, ct);
                    _logger.LogInformation("Document campaign {Year}: auto-sent error emails ({Sent} sent, {NoEmail} no-email).", year, report.Sent, report.NoEmail);
                }
                else
                {
                    var alertFor = await DocumentCampaignActions.GetSettingAsync(context, DocumentCampaignKeys.ErrorsAlertFor, ct);
                    if (alertFor != year)
                    {
                        var units = await DocumentCampaignActions.PendingByUnitAsync(context, ct);
                        await DocumentCampaignActions.SendCgAlertAsync(context, emailQueue, "Vérification 1", units, ct);
                        await DocumentCampaignActions.SetMarkerAsync(context, DocumentCampaignKeys.ErrorsAlertFor, year, ct);
                        _logger.LogInformation("Document campaign {Year}: verification not done at correction_start, alerted the CG.", year);
                    }
                }
            }
        }

        // ── Step 2 (final_deadline): on-hold ──
        if (status.FinalDeadline is { } fd && today >= fd)
        {
            var holdFor = await DocumentCampaignActions.GetSettingAsync(context, DocumentCampaignKeys.HoldAppliedFor, ct);
            if (holdFor != year)
            {
                var pending = await DocumentCampaignActions.PendingReviewCountAsync(context, ct);
                if (pending == 0)
                {
                    var report = await DocumentCampaignActions.RunApplyHoldAsync(context, emailQueue, year, ct);
                    _logger.LogInformation("Document campaign {Year}: auto-applied on-hold ({Held} held, {Emailed} emailed).", year, report.Held, report.Emailed);
                }
                else
                {
                    var alertFor = await DocumentCampaignActions.GetSettingAsync(context, DocumentCampaignKeys.HoldAlertFor, ct);
                    if (alertFor != year)
                    {
                        var units = await DocumentCampaignActions.PendingByUnitAsync(context, ct);
                        await DocumentCampaignActions.SendCgAlertAsync(context, emailQueue, "Vérification 2", units, ct);
                        await DocumentCampaignActions.SetMarkerAsync(context, DocumentCampaignKeys.HoldAlertFor, year, ct);
                        _logger.LogInformation("Document campaign {Year}: verification not done at final_deadline, alerted the CG.", year);
                    }
                }
            }
        }
    }
}
