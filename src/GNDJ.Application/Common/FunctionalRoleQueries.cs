using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Shared resolution of a unit type's "base" youth function — the role auto-assigned when a new member
// is placed (manual creation or demande conversion). Base role = the explicit "default for new members"
// function, else the lowest-rank non-archived one (rank asc, then name). Kept in one place so the manual
// create and the demande-send paths always agree.
public static class FunctionalRoleQueries
{
    // Batched: base role id per unit type (null for a type with no eligible function).
    public static async Task<Dictionary<Guid, Guid?>> ResolveBaseRoleIdsAsync(
        IApplicationDbContext context, IReadOnlyCollection<Guid> unitTypeIds, CancellationToken ct)
    {
        if (unitTypeIds.Count == 0) return new();
        var rows = await context.FunctionalRoles
            .Where(r => r.UnitTypeId != null && unitTypeIds.Contains(r.UnitTypeId.Value) && !r.IsArchived)
            .Select(r => new { r.Id, UnitTypeId = r.UnitTypeId!.Value, r.Rank, r.Name, r.IsDefaultForNewMembers })
            .ToListAsync(ct);
        return rows.GroupBy(r => r.UnitTypeId)
            .ToDictionary(g => g.Key, g => g
                .OrderByDescending(r => r.IsDefaultForNewMembers)
                .ThenBy(r => r.Rank).ThenBy(r => r.Name)
                .Select(r => (Guid?)r.Id).FirstOrDefault());
    }

    // Single unit type: base role id, or null if the type has no eligible function.
    public static async Task<Guid?> ResolveBaseRoleIdAsync(IApplicationDbContext context, Guid unitTypeId, CancellationToken ct)
        => (await ResolveBaseRoleIdsAsync(context, [unitTypeId], ct)).GetValueOrDefault(unitTypeId);
}
