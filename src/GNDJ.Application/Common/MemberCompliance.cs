using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Dossier-compliance flags for a batch of members, shared by the Membres list and the CU roster so both show
// the same green-check / amber-warning. 3 set-based queries for the whole batch, never N+1.
//  - DocsComplete = an Approved document exists for EVERY active document type (true when no type is active).
//  - CotisationOk = a cotisation for the current scout year (passage.scout_year) that has a payment or is
//    marked "ne paiera pas"; null when no scout year is configured (cotisation not tracked).
public static class MemberCompliance
{
    public record Flags(bool DocsComplete, bool? CotisationOk);

    public static async Task<Dictionary<Guid, Flags>> ComputeAsync(IApplicationDbContext context, IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        var result = new Dictionary<Guid, Flags>();
        if (ids.Count == 0) return result;

        var activeDocTypeIds = await context.DocumentTypes
            .Where(d => d.IsActive && !d.IsDeleted).Select(d => d.Id).ToListAsync(ct);
        var requiredCount = activeDocTypeIds.Count;

        var approvedTypeCount = requiredCount == 0
            ? new Dictionary<Guid, int>()
            : await context.MemberDocuments
                .Where(d => ids.Contains(d.MemberId) && !d.IsDeleted
                    && d.Status == Domain.Enums.DocumentStatus.Approved && activeDocTypeIds.Contains(d.DocumentTypeId))
                .GroupBy(d => d.MemberId)
                .Select(g => new { Id = g.Key, N = g.Select(x => x.DocumentTypeId).Distinct().Count() })
                .ToDictionaryAsync(x => x.Id, x => x.N, ct);

        // Active scout year follows the passage year (the year the CG opens) — single source of truth.
        var scoutYear = await context.Settings.Where(s => s.Key == "passage.scout_year")
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        var cotisTracked = !string.IsNullOrWhiteSpace(scoutYear);
        var cotisOk = cotisTracked
            ? (await context.MemberCotisations
                .Where(c => ids.Contains(c.MemberId) && !c.IsDeleted && c.ScoutYear == scoutYear
                    && (c.WillNotPay || c.Payments.Any(p => !p.IsDeleted)))
                .Select(c => c.MemberId).Distinct().ToListAsync(ct)).ToHashSet()
            : new HashSet<Guid>();

        foreach (var id in ids)
            result[id] = new Flags(
                requiredCount == 0 || approvedTypeCount.GetValueOrDefault(id) >= requiredCount,
                cotisTracked ? cotisOk.Contains(id) : null);
        return result;
    }
}
