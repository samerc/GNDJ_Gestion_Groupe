using FluentValidation;
using GNDJ.Application.Applicants;
using GNDJ.Application.Auth.Common;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// ============================================================
// « Soumettre pour la famille » — the CG / admin submits a DRAFT the family never submitted (after checking the
// whole file, editable with « Modifier »), optionally deciding it in the same step (accept into a unit / refuse).
// Same completeness rules as the family's own submit (ApplicantHelpers.IncompleteForSubmit); the family-side gates
// (submission window, verified email, accepted terms) don't apply — the CG acts for the family.
// When the year's answers already went out (« Envoyer les réponses » ran), a decision is answered AT ONCE: the
// single-demande send creates the member (card, login, post, Entrée, parents, fratrie), emails the family and the
// chef d'unité. Before that, the decision waits for the normal send like any other.
// ============================================================
public record SubmitDraftForFamilyResult(string SerialNumber, string Status, bool ResponseSent, string? SendError);

public record SubmitDraftForFamilyCommand(Guid Id, string? Decision, Guid? DecidedUnitId, string? DecisionNotes)
    : IRequest<Result<SubmitDraftForFamilyResult>>;

public class SubmitDraftForFamilyCommandValidator : AbstractValidator<SubmitDraftForFamilyCommand>
{
    public SubmitDraftForFamilyCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Decision).Must(s => s is null or DemandeStatus.Approved or DemandeStatus.Declined)
            .WithMessage("Décision invalide.");
        RuleFor(x => x.DecidedUnitId).NotNull().When(x => x.Decision == DemandeStatus.Approved)
            .WithMessage("Veuillez choisir une unité pour l'acceptation.");
        RuleFor(x => x.DecisionNotes).MaximumLength(1000).NoHtml();
    }
}

public class SubmitDraftForFamilyCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser,
    IAuditService audit, IEmailQueue emailQueue, IMediator mediator)
    : IRequestHandler<SubmitDraftForFamilyCommand, Result<SubmitDraftForFamilyResult>>
{
    public async ValueTask<Result<SubmitDraftForFamilyResult>> Handle(SubmitDraftForFamilyCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<SubmitDraftForFamilyResult>.Failure("Accès refusé.");

        var demande = await context.Demandes.FirstOrDefaultAsync(d => d.Id == request.Id, ct);
        if (demande is null) return Result<SubmitDraftForFamilyResult>.Failure("Demande introuvable.");
        if (demande.Status != DemandeStatus.Draft)
            return Result<SubmitDraftForFamilyResult>.Failure("Cette demande a déjà été soumise.");

        var account = await context.ApplicantAccounts.FirstOrDefaultAsync(a => a.Id == demande.ApplicantAccountId, ct);
        if (account is null) return Result<SubmitDraftForFamilyResult>.Failure("Compte introuvable.");
        var guardians = await context.ApplicantGuardians.Where(g => g.ApplicantAccountId == account.Id).ToListAsync(ct);
        if (ApplicantHelpers.IncompleteForSubmit(demande, account, guardians) is { } incomplete)
            return Result<SubmitDraftForFamilyResult>.Failure(incomplete + " Complétez-la avec « Modifier ».");

        var deciding = request.Decision is not null;
        if (request.Decision == DemandeStatus.Approved
            && !await context.Units.AnyAsync(u => u.Id == request.DecidedUnitId, ct))
            return Result<SubmitDraftForFamilyResult>.Failure("Unité introuvable.");
        // « Déjà membre ? » not answered yet: deciding now could create a second file for a child already in the
        // group. Submit without a decision, then answer the question on the demande (or reject the match first).
        if (deciding)
        {
            var match = (await DemandeMemberMatch.FindAsync(context, [DemandeMemberMatch.Input(demande)], ct)).GetValueOrDefault(demande.Id);
            if (match is not null && match.Status is null)
                return Result<SubmitDraftForFamilyResult>.Failure(
                    $"Cet enfant ressemble à {match.Name} ({match.CardNumber}), déjà dans le groupe. Répondez d'abord à « Déjà membre ? », ou soumettez sans décider.");
        }

        demande.Status = request.Decision ?? DemandeStatus.Submitted;
        demande.SubmittedAt ??= DateTime.UtcNow;
        if (deciding)
        {
            demande.DecidedUnitId = request.Decision == DemandeStatus.Approved ? request.DecidedUnitId : null;
            demande.DecisionNotes = request.DecisionNotes;
            demande.ReviewedByUserId = currentUser.UserId;
            demande.ReviewedAt = DateTime.UtcNow;
        }
        // Same number assignment as the family's submit (retry on the unique index if two submits race).
        demande.SerialNumber ??= await DemandeSerial.NextAsync(context, demande.ScoutYear, ct);
        for (var attempt = 0; ; attempt++)
        {
            try { await context.SaveChangesAsync(ct); break; }
            catch (DbUpdateException) when (attempt < 5)
            {
                demande.SerialNumber = await DemandeSerial.NextAsync(context, demande.ScoutYear, ct);
            }
        }
        await audit.LogAsync("SubmitForFamily", "Demande", demande.Id, newValues: new
        {
            Child = demande.FirstName + " " + demande.LastName,
            demande.SerialNumber,
            demande.Status,
            DecidedUnit = await AuditNames.UnitAsync(context, demande.DecidedUnitId, ct),
        }, cancellationToken: ct);

        // Answers already out + a decision → answer this one now (its own transaction, after the commit above). If the
        // send fails, the demande stays decided-not-sent: « Envoyer les réponses » picks it up later.
        var sendNow = deciding && await DemandeAdminHelpers.ResponsesSentAsync(context, demande.ScoutYear, ct);
        string? sendError = null;
        if (sendNow)
        {
            var sent = await mediator.Send(new SendDemandeResponsesCommand(demande.ScoutYear, demande.Id), ct);
            if (!sent.IsSuccess) sendError = sent.Error;
        }
        else
        {
            // Not answered now: the family gets the usual « demande reçue » confirmation (its answer comes with the send).
            await emailQueue.EnqueueAsync(new EmailJob("demande_submitted", account.Email, new Dictionary<string, string>
            {
                ["contactName"] = account.ContactName ?? "",
                ["childName"] = $"{demande.FirstName} {demande.LastName}".Trim(),
                ["scoutYear"] = demande.ScoutYear,
                ["demandeNumber"] = demande.SerialNumber ?? "",
            }), ct);
        }

        return Result<SubmitDraftForFamilyResult>.Success(new SubmitDraftForFamilyResult(
            demande.SerialNumber ?? "", demande.Status, sendNow && sendError is null, sendError));
    }
}
