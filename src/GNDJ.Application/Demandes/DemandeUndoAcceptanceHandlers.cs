using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// ============================================================
// « Annuler l'acceptation » — the CG refuses a demande whose acceptance was already sent (a member was created).
// Only for a member CREATED by this demande: the new file is removed for good with everything the send made for it
// (login + sessions + activation link, post, Entrée, parents nobody else uses, fratrie link) plus anything added
// since (documents, cotisations) — the same physical purge as the Corbeille (IMemberPurgeService), run at once so a
// later re-acceptance starts clean. The demande becomes « Refusée »: the refusal email goes now (SendRefusalNow), or
// no email at all — then it is marked answered (ResponseSentAt) so a later « Envoyer les réponses » never sends one.
// The unit's chef(s) d'unité, who got the child in their new-members Excel, are emailed that he won't join.
// A REUSED file (« Déjà membre ? » confirmed: former / active member) is refused: that person existed before the
// demande, so their fiche is changed by hand (end the post), never deleted.
// ============================================================
public record UndoAcceptancePreviewDto(
    string MemberName, string? CardNumber, string? UnitName, bool LoginUsed,
    int Documents, int Cotisations, int OtherPosts, string? Blocker);

public record GetUndoAcceptancePreviewQuery(Guid DemandeId) : IRequest<Result<UndoAcceptancePreviewDto>>;

public class GetUndoAcceptancePreviewQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUndoAcceptancePreviewQuery, Result<UndoAcceptancePreviewDto>>
{
    public async ValueTask<Result<UndoAcceptancePreviewDto>> Handle(GetUndoAcceptancePreviewQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<UndoAcceptancePreviewDto>.Failure("Accès refusé.");
        var d = await context.Demandes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.DemandeId, ct);
        if (d is null) return Result<UndoAcceptancePreviewDto>.Failure("Demande introuvable.");
        if (d.CreatedMemberId is not Guid memberId || d.Status != DemandeStatus.Approved)
            return Result<UndoAcceptancePreviewDto>.Failure("Cette demande n'a pas été acceptée avec création d'un membre.");

        var m = await context.Members.AsNoTracking().Where(x => x.Id == memberId)
            .Select(x => new { x.FirstName, x.LastName, x.CardNumber }).FirstOrDefaultAsync(ct);
        if (m is null) return Result<UndoAcceptancePreviewDto>.Failure("Membre introuvable.");
        var unit = d.DecidedUnitId is Guid u ? await context.Units.Where(x => x.Id == u).Select(x => x.Name).FirstOrDefaultAsync(ct) : null;
        // « Used » = signed in after the answer (an activated account the family may already rely on).
        var loginUsed = await context.Users.AnyAsync(x => x.MemberId == memberId && x.LastLoginAt != null && x.LastLoginAt > d.ResponseSentAt, ct);
        var docs = await context.MemberDocuments.CountAsync(x => x.MemberId == memberId, ct);
        var cotis = await context.MemberCotisations.CountAsync(x => x.MemberId == memberId, ct);
        var otherPosts = await context.MemberAssignments.CountAsync(x => x.MemberId == memberId && x.UnitId != d.DecidedUnitId, ct);

        return Result<UndoAcceptancePreviewDto>.Success(new UndoAcceptancePreviewDto(
            $"{m.FirstName} {m.LastName}".Trim(), m.CardNumber, unit, loginUsed, docs, cotis, otherPosts,
            UndoAcceptance.Blocker(d)));
    }
}

public record UndoDemandeAcceptanceResult(bool RefusalSent, string? SendError);

public record UndoDemandeAcceptanceCommand(Guid DemandeId, string? DecisionNotes, bool SendRefusalNow)
    : IRequest<Result<UndoDemandeAcceptanceResult>>;

public class UndoDemandeAcceptanceCommandValidator : AbstractValidator<UndoDemandeAcceptanceCommand>
{
    public UndoDemandeAcceptanceCommandValidator()
    {
        RuleFor(x => x.DemandeId).NotEmpty();
        RuleFor(x => x.DecisionNotes).MaximumLength(1000).NoHtml();
    }
}

public class UndoDemandeAcceptanceCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser,
    IMemberPurgeService purge, IAuditService audit, IMediator mediator, IEmailQueue emailQueue)
    : IRequestHandler<UndoDemandeAcceptanceCommand, Result<UndoDemandeAcceptanceResult>>
{
    public async ValueTask<Result<UndoDemandeAcceptanceResult>> Handle(UndoDemandeAcceptanceCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<UndoDemandeAcceptanceResult>.Failure("Accès refusé.");

        var d = await context.Demandes.FirstOrDefaultAsync(x => x.Id == request.DemandeId, ct);
        if (d is null) return Result<UndoDemandeAcceptanceResult>.Failure("Demande introuvable.");
        if (d.CreatedMemberId is not Guid memberId || d.Status != DemandeStatus.Approved)
            return Result<UndoDemandeAcceptanceResult>.Failure("Cette demande n'a pas été acceptée avec création d'un membre.");
        if (UndoAcceptance.Blocker(d) is { } blocker) return Result<UndoDemandeAcceptanceResult>.Failure(blocker);

        // Load the member ALONE (no Include of its required children — see DeleteMemberCommand: removing a principal
        // with tracked required dependents throws « association severed »).
        var member = await context.Members.FirstOrDefaultAsync(x => x.Id == memberId, ct);
        if (member is null) return Result<UndoDemandeAcceptanceResult>.Failure("Membre introuvable.");
        var memberName = $"{member.FirstName} {member.LastName}".Trim();
        var cardNumber = member.CardNumber;
        var unitName = await AuditNames.UnitAsync(context, d.DecidedUnitId, ct);
        var decidedUnitId = d.DecidedUnitId;

        // Fratrie: leave the sibling group; a group left with one member is dissolved (same rule as « Retirer »).
        var groupId = member.SiblingGroupId;
        member.SiblingGroupId = null;

        // The demande: refused, not answered yet (the refusal email is the next answer), unlinked from the file.
        d.Status = DemandeStatus.Declined;
        d.DecidedUnitId = null;
        d.DecisionNotes = request.DecisionNotes;
        d.CreatedMemberId = null;
        // Email now → unsent here, the single-demande send below answers it. No email → answered as of now, silently.
        d.ResponseSentAt = request.SendRefusalNow ? null : DateTime.UtcNow;
        d.MemberMatchId = null;
        d.MemberMatchStatus = null;
        d.ReviewedByUserId = currentUser.UserId;
        d.ReviewedAt = DateTime.UtcNow;

        // Soft-delete first (the purge only takes a soft-deleted member), in the same save as the demande changes.
        context.Members.Remove(member);
        await context.SaveChangesAsync(ct);

        if (groupId is Guid gid)
        {
            var remaining = await context.Members.Where(x => x.SiblingGroupId == gid).ToListAsync(ct);
            if (remaining.Count < 2)
            {
                foreach (var r in remaining) r.SiblingGroupId = null;
                var grp = await context.SiblingGroups.FirstOrDefaultAsync(g => g.Id == gid, ct);
                if (grp is not null) context.SiblingGroups.Remove(grp);
                await context.SaveChangesAsync(ct);
            }
        }

        // Audit BEFORE the purge (afterwards the member id points to nothing), with readable names.
        await audit.LogAsync("UndoAcceptance", "Demande", d.Id, oldValues: new { Membre = memberName, Matricule = cardNumber, Unite = unitName },
            newValues: new { Status = d.Status, Motif = d.DecisionNotes, EmailRefus = request.SendRefusalNow }, cancellationToken: ct);
        // Physical delete: login (+ sessions), posts, Entrée, documents, cotisations, contacts, parents nobody else uses.
        await purge.PurgeAsync(memberId, ct);

        // Tell the unit's chef(s) d'unité (they had the child in their new-members Excel) — always, whatever the family gets.
        if (decidedUnitId is Guid uid)
        {
            var heads = await UnitNewMembersMail.LoadUnitHeadsAsync(context, [uid], ct);
            await emailQueue.EnqueueManyAsync((heads.GetValueOrDefault(uid) ?? []).Select(cu => new EmailJob("demande_unit_member_cancelled", cu.Email,
                new Dictionary<string, string>
                {
                    ["leaderName"] = cu.Name, ["unitName"] = unitName ?? "", ["childName"] = memberName, ["scoutYear"] = d.ScoutYear,
                })), ct);
        }

        // Refusal email now (same single-demande send as « Soumettre pour la famille »); otherwise none.
        string? sendError = null;
        if (request.SendRefusalNow)
        {
            var sent = await mediator.Send(new SendDemandeResponsesCommand(d.ScoutYear, d.Id), ct);
            if (!sent.IsSuccess) sendError = sent.Error;
        }
        return Result<UndoDemandeAcceptanceResult>.Success(new UndoDemandeAcceptanceResult(request.SendRefusalNow && sendError is null, sendError));
    }
}

static class UndoAcceptance
{
    // Why the acceptance can't be undone automatically (null = it can).
    public static string? Blocker(Domain.Entities.Demande d)
        => d.MemberMatchStatus == DemandeMemberMatchStatus.Confirmed && d.MemberMatchId == d.CreatedMemberId
            ? "Cet enfant était déjà membre : sa fiche existait avant la demande et ne peut pas être supprimée. Terminez son affectation depuis sa fiche."
            : null;
}
