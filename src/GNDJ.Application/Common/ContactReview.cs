using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// When must a member (re)confirm their household contacts (the « Vérifiez vos coordonnées » popup and the
// « Ma rentrée » to-do)? Never confirmed → yes. Confirmed → again once per year: when this year's document
// campaign has started (documents.deposit_start reached) and the last confirmation is older than that start.
// No deposit date set → a past confirmation stays valid.
public static class ContactReview
{
    public static async Task<DateOnly?> YearStartAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var raw = await context.Settings.Where(s => s.Key == "documents.deposit_start").Select(s => s.Value).FirstOrDefaultAsync(ct);
        return DateOnly.TryParseExact(raw, "yyyy-MM-dd", out var d) && d <= LebanonClock.Today ? d : null;
    }

    public static bool IsDue(DateTime? reviewedAt, DateOnly? yearStart) =>
        reviewedAt is null || (yearStart is { } s && DateOnly.FromDateTime(reviewedAt.Value) < s);
}
