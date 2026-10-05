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
                && (d.Status == DemandeStatus.Approved || d.Status == DemandeStatus.Declined))
            .Select(d => new { d.Id, d.Status, d.DecidedUnitId, d.FirstName, d.LastName, d.Email, d.ApplicantAccountId, AccountEmail = d.ApplicantAccount.Email })
            .ToListAsync(ct);
        var approved = pending.Where(d => d.Status == DemandeStatus.Approved).ToList();
        var declined = pending.Count - approved.Count;

        if (pending.Count == 0 && undecided == 0)
            blockers.Add("Aucune réponse à envoyer : toutes les décisions ont déjà été envoyées.");

        // Recipient per demande: account email, else the first parent's, else the child's (same order as the send).
        var accountIds = pending.Select(d => d.ApplicantAccountId).Distinct().ToList();
        var guardianEmails = (await context.ApplicantGuardians
                .Where(g => accountIds.Contains(g.ApplicantAccountId) && g.Email != null && g.Email != "")
                .Select(g => new { g.ApplicantAccountId, g.Email }).ToListAsync(ct))
            .GroupBy(g => g.ApplicantAccountId).ToDictionary(g => g.Key, g => g.First().Email);
        var noEmail = pending
            .Where(d => string.IsNullOrWhiteSpace(d.AccountEmail) && !guardianEmails.ContainsKey(d.ApplicantAccountId) && string.IsNullOrWhiteSpace(d.Email))
            .Select(d => $"{d.FirstName} {d.LastName}").ToList();
        if (noEmail.Count > 0)
            warnings.Add($"Sans email, aucune réponse ne partira pour : {string.Join(", ", noEmail)}.");

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
            new("Nouveaux membres créés (avec identifiant)", approved.Count,
                perUnit.Count == 0 ? null : string.Join(" · ", perUnit.Select(x => $"{x.Unit?.Code ?? "?"} : {x.Count}"))),
            new("Refus envoyés", declined),
            new("Emails aux familles", pending.Count - noEmail.Count),
            new("Chefs d'unité prévenus (liste Excel)", heads.Values.Sum(r => r.Count)),
        };
        return Result<ActionPreviewDto>.Success(new ActionPreviewDto(lines, warnings, blockers));
    }
}
