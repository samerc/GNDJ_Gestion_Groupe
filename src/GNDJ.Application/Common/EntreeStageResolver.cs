using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Shared resolution of a unit's "Entrée à …" scout stage. Used whenever a member ENTERS a new unit (passage
// finalize, demande acceptance) so the entrée progression is created automatically instead of by hand —
// mirrors the one-time backfill (deploy/patches/009).
//
// The entrée stage is matched by EXACT NAME per unit-type code: scout_stages.display_order is unreliable in the
// migrated data (many stages share order 0, and some branches' order-0 stage isn't the entrée — e.g. Meute's is
// "1er Sizenier"), and CLAN carries an extra inactive "Entrée Equipe Pilote" stage. The names below are the same
// mapping patch 009 uses. Caravelles (CAR) has no entrée stage → resolves to null (no-op).
//
// Batched by design (one query per finalize/send batch, not per member) so it never re-introduces an N+1 inside
// the perf-sensitive advisory-locked handlers.
public static class EntreeStageResolver
{
    public const string AutoNote = "Entrée — ajout automatique";

    // unit-type code -> exact entrée stage name
    private static readonly Dictionary<string, string> EntreeStageNameByCode = new(StringComparer.OrdinalIgnoreCase)
    {
        ["MEU"] = "Entrée à la Meute",
        ["RON"] = "Entrée à la Ronde",
        ["TRO"] = "Entrée à la Troupe",
        ["COM"] = "Entr. à la Compagnie",
        ["CLAN"] = "Entrée au Clan",
        ["NOY"] = "Entrée au Noyau",
        ["JEM"] = "Entrée à l'équipe JEM",
        ["FEU"] = "Entrée au Feu",
        ["GRP"] = "Entrée au Groupe",
    };

    // Batched: active entrée scout-stage id per unit (resolved via the unit's type). A unit whose type has no
    // mapped/active entrée stage (e.g. Caravelles) maps to null.
    public static async Task<Dictionary<Guid, Guid?>> ResolveStagesForUnitsAsync(
        IApplicationDbContext context, IReadOnlyCollection<Guid> unitIds, CancellationToken ct)
    {
        if (unitIds.Count == 0) return new();

        // unit -> its type code
        var units = await context.Units.Where(u => unitIds.Contains(u.Id))
            .Select(u => new { u.Id, Code = u.UnitType.Code })
            .ToListAsync(ct);

        var codes = units.Select(u => u.Code).Distinct().ToList();
        var wantedNames = codes.Where(EntreeStageNameByCode.ContainsKey)
            .Select(c => EntreeStageNameByCode[c]).Distinct().ToList();

        // Active entrée stages for those type codes (exact name). Re-filter by code+name in memory so a name
        // can only satisfy its own code.
        var stages = await context.ScoutStages
            .Where(s => s.IsActive && codes.Contains(s.UnitType.Code) && wantedNames.Contains(s.Name))
            .Select(s => new { Code = s.UnitType.Code, s.Name, s.Id })
            .ToListAsync(ct);

        var stageByCode = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        foreach (var s in stages)
            if (EntreeStageNameByCode.TryGetValue(s.Code, out var want) && string.Equals(want, s.Name, StringComparison.Ordinal))
                stageByCode[s.Code] = s.Id;

        return units.ToDictionary(u => u.Id, u => stageByCode.TryGetValue(u.Code, out var sid) ? (Guid?)sid : null);
    }
}
