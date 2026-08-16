using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// Reminder A — "please submit your demande before the deadline". Manual (a CG button, not a scheduler):
// targets applicant accounts that registered but have NO submitted demande yet for the scout year (only drafts,
// or nothing). Reminder B (accepted members who never activated their login) is the existing "Envoyer les accès →
// jamais connectés" tool in the member area, so it's not rebuilt here.

// "submitted or beyond" = past the Draft stage (Submitted / Approved / Declined). A Draft = never submitted.
file static class ReminderStatus
{
    public static readonly string[] Submitted = { DemandeStatus.Submitted, DemandeStatus.Approved, DemandeStatus.Declined };
}

// Count of accounts to remind (for the button label) — accounts with no submitted demande this year.
public record GetUnsubmittedCountQuery(string ScoutYear) : IRequest<Result<int>>;

public class GetUnsubmittedCountQueryHandler(IApplicationDbContext context) : IRequestHandler<GetUnsubmittedCountQuery, Result<int>>
{
    public async ValueTask<Result<int>> Handle(GetUnsubmittedCountQuery request, CancellationToken ct)
    {
        // Accounts that have NO demande in a submitted-or-beyond state for this year.
        var count = await context.ApplicantAccounts
            .CountAsync(a => !context.Demandes.Any(d => d.ApplicantAccountId == a.Id
                && d.ScoutYear == request.ScoutYear && ReminderStatus.Submitted.Contains(d.Status)), ct);
        return Result<int>.Success(count);
    }
}

// Send the reminder to every such account. Returns how many were queued.
public record SendSubmissionRemindersCommand(string ScoutYear) : IRequest<Result<int>>;

public class SendSubmissionRemindersCommandHandler(IApplicationDbContext context, IEmailQueue emailQueue, IAuditService audit)
    : IRequestHandler<SendSubmissionRemindersCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(SendSubmissionRemindersCommand request, CancellationToken ct)
    {
        var accounts = await context.ApplicantAccounts
            .Where(a => !context.Demandes.Any(d => d.ApplicantAccountId == a.Id
                && d.ScoutYear == request.ScoutYear && ReminderStatus.Submitted.Contains(d.Status)))
            .Select(a => new { a.Email, a.ContactName })
            .ToListAsync(ct);

        var baseUrl = ((await context.Settings.Where(s => s.Key == "app.base_url").Select(s => s.Value).FirstOrDefaultAsync(ct)) ?? "http://localhost:5173").TrimEnd('/');
        var portalUrl = $"{baseUrl}/inscription";
        // Deadline (dd/MM/yyyy) for the email, else a soft phrase.
        var deadlineRaw = await context.Settings.Where(s => s.Key == "demande.submission_deadline").Select(s => s.Value).FirstOrDefaultAsync(ct);
        var deadline = DateOnly.TryParseExact(deadlineRaw, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var dl)
            ? dl.ToString("dd/MM/yyyy") : "prochainement";

        var jobs = accounts
            .Where(a => !string.IsNullOrWhiteSpace(a.Email))
            .Select(a => new EmailJob("demande_submission_reminder", a.Email, new Dictionary<string, string>
            {
                ["contactName"] = a.ContactName ?? "",
                ["deadline"] = deadline,
                ["scoutYear"] = request.ScoutYear,
                ["portalUrl"] = portalUrl,
            }))
            .ToList();

        await emailQueue.EnqueueManyAsync(jobs, ct);
        await audit.LogAsync("SendSubmissionReminders", "Demande", null, newValues: new { count = jobs.Count, request.ScoutYear }, cancellationToken: ct);
        return Result<int>.Success(jobs.Count);
    }
}
