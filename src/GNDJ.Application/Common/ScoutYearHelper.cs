namespace GNDJ.Application.Common;

// Scout-year helpers. A scout year runs Oct 1 → Oct 1 (matching the migration's per-SY assignment split),
// labelled "YYYY-YYYY" (e.g. "2023-2024" = 2023-10-01 .. 2024-10-01).
public static class ScoutYearHelper
{
    // The [start, end) window for a "YYYY-YYYY" scout year; falls back to the current year's window when blank/invalid.
    public static (DateOnly Start, DateOnly End) Window(string? scoutYear)
    {
        var now = DateTime.UtcNow;
        var startYear = now.Month >= 10 ? now.Year : now.Year - 1;
        if (!string.IsNullOrWhiteSpace(scoutYear))
        {
            var first = scoutYear.Split('-')[0].Trim();
            if (int.TryParse(first, out var y) && y is >= 2000 and <= 2100) startYear = y;
        }
        return (new DateOnly(startYear, 10, 1), new DateOnly(startYear + 1, 10, 1));
    }

    // The scout-year label a date falls in (Oct-1 boundary): Oct-Dec → "Y-Y+1", Jan-Sep → "Y-1-Y".
    public static string Of(DateOnly d) => d.Month >= 10 ? $"{d.Year}-{d.Year + 1}" : $"{d.Year - 1}-{d.Year}";
}
