using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

// Reads the group-wide "reports.cards_enabled" master switch for member-card generation. Missing/blank/any
// value other than "false" => enabled (so an older DB without the setting keeps working). Toggled by the
// CG/super-admin in Settings; gates both the single (GenerateMemberCardQuery) and bulk (GenerateBulkCardsQuery)
// card endpoints, and the "Cartes" buttons in the UI read the same setting.
public static class CardConfig
{
    public static async Task<bool> CardsEnabledAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var value = await context.Settings
            .Where(s => s.Key == "reports.cards_enabled")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);
        return !string.Equals(value, "false", StringComparison.OrdinalIgnoreCase);
    }
}
