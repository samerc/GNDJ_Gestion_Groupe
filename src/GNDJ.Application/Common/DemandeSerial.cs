using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Generates the human-facing demande reference: INS-YYYY-NNNN (YYYY = the scout year's start year,
// NNNN = a 4-digit sequence that resets each scout year). Read-max+1; the caller saves under a unique
// index and retries on a collision (two parents submitting at the same instant).
public static class DemandeSerial
{
    public static async Task<string> NextAsync(IApplicationDbContext context, string scoutYear, CancellationToken ct)
    {
        var startYear = string.IsNullOrWhiteSpace(scoutYear) ? "0000" : scoutYear.Split('-')[0];
        // Existing serials for this scout year → parse the trailing sequence, take the max.
        var serials = await context.Demandes
            .Where(d => d.ScoutYear == scoutYear && d.SerialNumber != null)
            .Select(d => d.SerialNumber!)
            .ToListAsync(ct);
        var max = 0;
        foreach (var s in serials)
        {
            var dash = s.LastIndexOf('-');
            if (dash >= 0 && int.TryParse(s[(dash + 1)..], out var n) && n > max) max = n;
        }
        return $"INS-{startYear}-{max + 1:D4}";
    }
}
