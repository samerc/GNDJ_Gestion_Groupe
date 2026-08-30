using GNDJ.Application.Common;

namespace GNDJ.Application.Tests;

// A scout year runs Oct 1 → Oct 1, labelled "YYYY-YYYY". The Oct-1 boundary is used everywhere (dashboards,
// cotisations, absences, trombinoscope, reports) so its edges must be exact.
public class ScoutYearHelperTests
{
    [Theory]
    [InlineData(2023, 10, 1, "2023-2024")]  // first day of the year
    [InlineData(2023, 12, 31, "2023-2024")] // Oct–Dec → Y..Y+1
    [InlineData(2024, 1, 1, "2023-2024")]   // Jan–Sep → Y-1..Y
    [InlineData(2024, 9, 30, "2023-2024")]  // last day before the boundary
    [InlineData(2024, 10, 1, "2024-2025")]  // boundary flips to the next year
    public void Of_labels_the_year_by_the_Oct1_boundary(int y, int m, int d, string expected)
    {
        Assert.Equal(expected, ScoutYearHelper.Of(new DateOnly(y, m, d)));
    }

    [Fact]
    public void Window_of_an_explicit_year_is_Oct1_to_Oct1()
    {
        var (start, end) = ScoutYearHelper.Window("2023-2024");
        Assert.Equal(new DateOnly(2023, 10, 1), start);
        Assert.Equal(new DateOnly(2024, 10, 1), end);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not-a-year")]
    [InlineData("1999-2000")] // out of the accepted 2000..2100 range → falls back to current
    public void Window_falls_back_to_a_valid_current_window(string? input)
    {
        var (start, end) = ScoutYearHelper.Window(input);
        // Whatever "today" is, the fallback window is always a clean Oct-1 → Oct-1 span of exactly one year.
        Assert.Equal(10, start.Month);
        Assert.Equal(1, start.Day);
        Assert.Equal(start.AddYears(1), end);
    }

    [Fact]
    public void Window_and_Of_are_consistent_for_the_start_date()
    {
        // The start of a window is labelled by that same year.
        var (start, _) = ScoutYearHelper.Window("2025-2026");
        Assert.Equal("2025-2026", ScoutYearHelper.Of(start));
    }
}
