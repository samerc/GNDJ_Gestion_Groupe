using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Passages;

// « Ce qui va se passer » before « Publier le passage »: how many lines are published (and how many still-pending
// ones get accepted on the way), who changes unit (per destination), who leaves the group, the planned maîtrise
// changes and the chefs d'unité who get their newcomers' Excel. Same gates as FinalizePassagesCommand. Read-only.
// GET /passages/finalize/preview (passage.manage); the handler re-checks super-admin or passage.manage.
public record GetFinalizePreviewQuery(string ScoutYear) : IRequest<Result<ActionPreviewDto>>;

public class GetFinalizePreviewQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetFinalizePreviewQuery, Result<ActionPreviewDto>>
{
    public async ValueTask<Result<ActionPreviewDto>> Handle(GetFinalizePreviewQuery request, CancellationToken ct)
    {
        if (!PassageLocks.IsManager(currentUser))
            return Result<ActionPreviewDto>.Failure("Accès réservé à la maîtrise de groupe.");
        var year = request.ScoutYear;
        var blockers = new List<string>();
        var warnings = new List<string>();

        // Gates (same as the publication).
        var active = await PassageScope.ActiveYouth(context).Select(a => new { a.MemberId, a.UnitId }).ToListAsync(ct);
        var lineMemberIds = (await PassageScope.Lines(context).Where(p => p.ScoutYear == year).Select(p => p.MemberId).ToListAsync(ct)).ToHashSet();
        var missing = active.Select(a => a.MemberId).Distinct().Count(id => !lineMemberIds.Contains(id));
        if (missing > 0) blockers.Add($"{missing} membre(s) sans ligne de passage.");
        var submitted = (await context.PassageUnitSubmissions.Where(s => s.ScoutYear == year).Select(s => s.UnitId).ToListAsync(ct)).ToHashSet();
        var unfinished = active.Select(a => a.UnitId).Distinct().Where(u => !submitted.Contains(u)).ToList();
        if (unfinished.Count > 0)
        {
            var codes = await context.Units.Where(u => unfinished.Contains(u.Id)).OrderBy(u => u.Code).Select(u => u.Code).ToListAsync(ct);
            blockers.Add($"Unités qui n'ont pas terminé : {string.Join(", ", codes)}.");
        }
        if (await PassageScope.Lines(context).AnyAsync(p => p.ScoutYear == year && p.Status == PassageStatus.Rejected, ct))
            blockers.Add("Des lignes sont encore « rejetées » : choisissez leur destination.");

        // The lines the publication would process: Approved ones plus Pending ones it accepts as proposed. The CG's
        // decision (Final*) wins over the CU's proposal (Proposed*), same as at publication.
        var lines = await PassageScope.Lines(context)
            .Where(p => p.ScoutYear == year && (p.Status == PassageStatus.Approved || p.Status == PassageStatus.Pending))
            .Select(p => new
            {
                p.Status, p.CurrentUnitId,
                Leaving = p.FinalIsLeaving ?? p.IsLeaving,
                Dest = p.FinalUnitId ?? p.ProposedUnitId,
            }).ToListAsync(ct);
        if (lines.Count == 0 && blockers.Count == 0)
            blockers.Add("Aucune ligne à publier : le passage de cette année est déjà publié.");

        var leaving = lines.Count(l => l.Leaving);
        var moves = lines.Where(l => !l.Leaving && l.Dest != l.CurrentUnitId).ToList();
        var stay = lines.Count - leaving - moves.Count;
        var autoAccepted = lines.Count(l => l.Status == PassageStatus.Pending);

        var destIds = moves.Select(m => m.Dest).Distinct().ToList();
        var units = await context.Units.Where(u => destIds.Contains(u.Id)).Select(u => new { u.Id, u.Code, u.Name }).ToListAsync(ct);
        // Chefs d'unité of the receiving units = who gets the newcomers' Excel (reachable by email only).
        var heads = await UnitNewMembersMail.LoadUnitHeadsAsync(context, destIds, ct);
        var perDest = moves.GroupBy(m => m.Dest)
            .Select(g => (Code: units.FirstOrDefault(u => u.Id == g.Key)?.Code ?? "?", Count: g.Count()))
            .OrderBy(x => ActionPreviewText.NaturalKey(x.Code)).ToList();
        var noCu = units.Where(u => !heads.ContainsKey(u.Id)).Select(u => u.Name).ToList();
        if (noCu.Count > 0)
            warnings.Add($"Pas de chef d'unité joignable par email (la liste des nouveaux membres ne sera pas envoyée) : {string.Join(", ", noCu)}.");

        // Maîtrise plan lines not yet applied — FinalizePassages applies them in the same transaction.
        var plan = await context.MaitrisePlanLines.Where(l => l.ScoutYear == year && l.AppliedAt == null)
            .GroupBy(l => l.Kind).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct);
        var planStarts = plan.FirstOrDefault(p => p.Key == MaitrisePlanKinds.Start)?.Count ?? 0;
        var planEnds = plan.FirstOrDefault(p => p.Key == MaitrisePlanKinds.End)?.Count ?? 0;

        var dateRaw = await context.Settings.Where(s => s.Key == "passage.date").Select(s => s.Value).FirstOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(dateRaw))
            warnings.Add("La « Date du passage » n'est pas définie : les changements prendront effet le jour de la publication.");

        var result = new List<ActionPreviewLine>
        {
            new("Lignes publiées", lines.Count, autoAccepted > 0 ? $"dont {autoAccepted} encore en attente, acceptées telles que proposées" : null),
            new("Changent d'unité", moves.Count, perDest.Count == 0 ? null : string.Join(" · ", perDest.Select(x => $"→ {x.Code} : {x.Count}"))),
            new("Restent dans leur unité", stay),
            new("Quittent le groupe", leaving),
        };
        if (planStarts + planEnds > 0)
            result.Add(new("Changements de maîtrise prévus", planStarts + planEnds, $"{planStarts} arrivée(s), {planEnds} départ(s)"));
        result.Add(new("Chefs d'unité prévenus (liste Excel)", heads.Values.Sum(r => r.Count)));
        return Result<ActionPreviewDto>.Success(new ActionPreviewDto(result, warnings, blockers));
    }
}
