using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// « Ce qui va se passer » before « Envoyer les réponses »: the members that will be created (per unit), the refusals,
// the emails to families (one per demande, to the account email — same fallback as the send) and the chefs d'unité
// who will receive their Excel. Same gates as SendDemandeResponsesCommand (undecided demandes, unit without a base
// function). Read-only; group managers only.
public record GetSendResponsesPreviewQuery(string ScoutYear) : IRequest<Result<ActionPreviewDto>>;

public class GetSendResponsesPreviewQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetSendResponsesPreviewQuery, Result<ActionPreviewDto>>
{
    public async ValueTask<Result<ActionPreviewDto>> Handle(GetSendResponsesPreviewQuery request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<ActionPreviewDto>.Failure("Accès réservé au chef de groupe.");

        var blockers = new List<string>();
        var warnings = new List<string>();

        var undecided = await context.Demandes
            .CountAsync(d => d.ScoutYear == request.ScoutYear && d.Status == DemandeStatus.Submitted && d.ResponseSentAt == null, ct);
        if (undecided > 0)
            blockers.Add($"{undecided} demande(s) encore en attente de décision : acceptez-les ou refusez-les d'abord.");

        var pending = await context.Demandes
            .Where(d => d.ScoutYear == request.ScoutYear && d.ResponseSentAt == null
                && (d.Status == DemandeStatus.Approved || d.Status == DemandeStatus.Declined || d.Status == DemandeStatus.AlreadyMember))
            .Select(d => new { d.Id, d.Status, d.DecidedUnitId, d.FirstName, d.LastName, d.DateOfBirth, d.Email, d.ApplicantAccountId, AccountEmail = d.ApplicantAccount.Email, d.HasPreviousDemande, d.PreviousDemandeYear, d.MemberMatchId, d.MemberMatchStatus, d.Gender })
            .ToListAsync(ct);
        var approved = pending.Where(d => d.Status == DemandeStatus.Approved).ToList();
        var alreadyMembers = pending.Where(d => d.Status == DemandeStatus.AlreadyMember).ToList();
        var declined = pending.Count(d => d.Status == DemandeStatus.Declined);

        if (pending.Count == 0 && undecided == 0)
            blockers.Add("Aucune réponse à envoyer : toutes les décisions ont déjà été envoyées.");

        // Recipient per demande: account email, else the first parent's, else the child's (same order as the send).
        var accountIds = pending.Select(d => d.ApplicantAccountId).Distinct().ToList();
        var guardianEmails = (await context.ApplicantGuardians
                .Where(g => accountIds.Contains(g.ApplicantAccountId) && g.Email != null && g.Email != "")
                .Select(g => new { g.ApplicantAccountId, g.Email }).ToListAsync(ct))
            .GroupBy(g => g.ApplicantAccountId).ToDictionary(g => g.Key, g => g.First().Email);
        var noEmail = pending
            .Where(d => d.Status != DemandeStatus.AlreadyMember) // no email for them anyway
            .Where(d => string.IsNullOrWhiteSpace(d.AccountEmail) && !guardianEmails.ContainsKey(d.ApplicantAccountId) && string.IsNullOrWhiteSpace(d.Email))
            .Select(d => $"{d.FirstName} {d.LastName}").ToList();
        if (noEmail.Count > 0)
            warnings.Add($"Sans email, aucune réponse ne partira pour : {string.Join(", ", noEmail)}.");

        // Family consistency (warnings only — the CG may have a reason): (1) one account with both an accepted and a
        // refused child this year; (2) a refusal while a brother/sister is already in the group (declared as a
        // current member, or linked to a member with an active post).
        var yearDecisions = await context.Demandes
            .Where(d => d.ScoutYear == request.ScoutYear && (d.Status == DemandeStatus.Approved || d.Status == DemandeStatus.Declined))
            .Select(d => new { d.ApplicantAccountId, d.Status, d.FirstName, d.LastName })
            .ToListAsync(ct);
        var mixed = yearDecisions.GroupBy(d => d.ApplicantAccountId)
            .Where(g => g.Any(x => x.Status == DemandeStatus.Approved) && g.Any(x => x.Status == DemandeStatus.Declined))
            .Select(g => string.Join(" / ", g.Select(x => $"{x.FirstName} {x.LastName} ({(x.Status == DemandeStatus.Approved ? "acceptée" : "refusée")})")))
            .ToList();
        if (mixed.Count > 0)
            warnings.Add($"{mixed.Count} famille(s) avec des réponses différentes (acceptée et refusée) : {string.Join(" ; ", mixed)}.");

        var declinedAccounts = pending.Where(d => d.Status == DemandeStatus.Declined).Select(d => d.ApplicantAccountId).Distinct().ToList();
        if (declinedAccounts.Count > 0)
        {
            var rels = await context.ApplicantScoutRelations
                .Where(r => declinedAccounts.Contains(r.ApplicantAccountId))
                .Select(r => new
                {
                    r.ApplicantAccountId, r.Relationship, r.Status,
                    LinkedActive = r.RelatedMemberId != null
                        && context.MemberAssignments.Any(a => a.MemberId == r.RelatedMemberId && a.EndDate == null),
                })
                .ToListAsync(ct);
            var withSibling = rels
                .Where(r => ScoutRelationKind.IsSibling(r.Relationship) && (r.Status == "CurrentInGroup" || r.LinkedActive))
                .Select(r => r.ApplicantAccountId).ToHashSet();
            var refusedWithSibling = pending
                .Where(d => d.Status == DemandeStatus.Declined && withSibling.Contains(d.ApplicantAccountId))
                .Select(d => $"{d.FirstName} {d.LastName}").ToList();
            if (refusedWithSibling.Count > 0)
                warnings.Add($"Refus alors qu'un frère ou une sœur est déjà membre du groupe : {string.Join(", ", refusedWithSibling)}.");
        }

        // (3) a refusal for a child whose family declared a demande in a previous year.
        var refusedAgain = pending.Where(d => d.Status == DemandeStatus.Declined && d.HasPreviousDemande)
            .Select(d => $"{d.FirstName} {d.LastName}{(string.IsNullOrWhiteSpace(d.PreviousDemandeYear) ? "" : $" ({d.PreviousDemandeYear})")}").ToList();
        if (refusedAgain.Count > 0)
            warnings.Add($"Refus alors qu'une demande a déjà été faite une année précédente : {string.Join(", ", refusedAgain)}.");

        // (4) an accepted child who looks like an EXISTING member (same name + birth date): sending would create a
        // second member file. Merge or refuse first (Fratries → Doublons can merge afterwards).
        // « Déjà membre ? » answered "same person" → that file is updated instead (see DemandeMemberMatch); a flag not
        // answered yet still means a second file, so the CG is told which demandes to check.
        var answerable = pending.Where(d => d.Status != DemandeStatus.AlreadyMember).ToList();
        var matches = await DemandeMemberMatch.FindAsync(context,
            answerable.Select(d => new DemandeMatchInput(d.Id, d.FirstName, d.LastName, d.DateOfBirth, d.ApplicantAccountId, null, d.MemberMatchId, d.MemberMatchStatus, d.Gender)).ToList(), ct);
        var notChecked = approved.Where(d => matches.TryGetValue(d.Id, out var m) && m.Status is null)
            .Select(d => $"{d.FirstName} {d.LastName} ({matches[d.Id].CardNumber})").ToList();
        if (notChecked.Count > 0)
            warnings.Add($"« Déjà membre ? » non vérifié — l'envoi créera une deuxième fiche : {string.Join(", ", notChecked)}. Répondez sur ces demandes (même personne / personne différente).");
        // A refusal for a child who is still an ACTIVE member would send a refusal email to a current member's family.
        var refusedActive = answerable.Where(d => d.Status == DemandeStatus.Declined && matches.TryGetValue(d.Id, out var m) && m.Status is null && m.IsActive)
            .Select(d => $"{d.FirstName} {d.LastName} ({matches[d.Id].CardNumber})").ToList();
        if (refusedActive.Count > 0)
            warnings.Add($"« Déjà membre ? » non vérifié sur un refus — la famille d'un membre actif recevra un email de refus : {string.Join(", ", refusedActive)}. Répondez « Même personne » pour mettre la demande de côté.");
        var reusedCount = approved.Count(d => matches.TryGetValue(d.Id, out var m) && m.Status == DemandeMemberMatchStatus.Confirmed);

        // Accepted members per unit + the chefs d'unité who will get the Excel.
        var unitIds = approved.Where(d => d.DecidedUnitId.HasValue).Select(d => d.DecidedUnitId!.Value).Distinct().ToList();
        var units = await context.Units.Where(u => unitIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Code, u.Name, u.UnitTypeId }).ToListAsync(ct);
        var heads = await UnitNewMembersMail.LoadUnitHeadsAsync(context, unitIds, ct);
        var baseRoles = await FunctionalRoleQueries.ResolveBaseRoleIdsAsync(context, units.Select(u => u.UnitTypeId).Distinct().ToList(), ct);

        var perUnit = approved.Where(d => d.DecidedUnitId.HasValue)
            .GroupBy(d => d.DecidedUnitId!.Value)
            .Select(g => (Unit: units.FirstOrDefault(u => u.Id == g.Key), Count: g.Count()))
            .OrderBy(x => ActionPreviewText.NaturalKey(x.Unit?.Code ?? "")).ToList();
        var missingUnit = approved.Count(d => !d.DecidedUnitId.HasValue);
        if (missingUnit > 0)
            blockers.Add($"{missingUnit} demande(s) acceptée(s) sans unité choisie.");
        foreach (var u in units.Where(u => baseRoles.GetValueOrDefault(u.UnitTypeId) is null))
            blockers.Add($"Aucune fonction par défaut pour l'unité {u.Name} : définissez-la dans les Fonctions.");
        var noCu = units.Where(u => !heads.ContainsKey(u.Id)).Select(u => u.Name).ToList();
        if (noCu.Count > 0)
            warnings.Add($"Pas de chef d'unité joignable par email (la liste des nouveaux membres ne sera pas envoyée) : {string.Join(", ", noCu)}.");

        var lines = new List<ActionPreviewLine>
        {
            new("Nouveaux membres créés (avec identifiant)", approved.Count - reusedCount,
                perUnit.Count == 0 ? null : string.Join(" · ", perUnit.Select(x => $"{x.Unit?.Code ?? "?"} : {x.Count}"))),
            new("Rattachés à leur fiche existante (identifiant conservé)", reusedCount),
            new("Refus envoyés", declined),
            new("Déjà membres : fiche mise à jour, aucun email", alreadyMembers.Count),
            new("Emails aux familles", pending.Count - alreadyMembers.Count - noEmail.Count),
            new("Chefs d'unité prévenus (liste Excel)", heads.Values.Sum(r => r.Count)),
        };
        return Result<ActionPreviewDto>.Success(new ActionPreviewDto(lines, warnings, blockers));
    }
}
