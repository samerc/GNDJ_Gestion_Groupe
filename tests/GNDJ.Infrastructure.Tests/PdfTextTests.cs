using GNDJ.Infrastructure.Services;

namespace GNDJ.Infrastructure.Tests;

// PdfText.GetInitials drives the photo-placeholder initials on generated member cards / trombinoscopes.
// It must handle the awkward real-world names (single word, extra spaces, empty) without throwing.
public class PdfTextTests
{
    [Theory]
    [InlineData("Jean Dupont", "JD")]
    [InlineData("Marie Claire Assaf", "MA")]  // first + LAST word
    [InlineData("Rhea", "R")]                  // single word → single initial
    [InlineData("  Jean   Dupont  ", "JD")]    // collapses extra whitespace
    [InlineData("", "?")]
    [InlineData("   ", "?")]
    [InlineData(null, "?")]
    public void GetInitials_handles_real_world_names(string? name, string expected)
    {
        Assert.Equal(expected, PdfText.GetInitials(name));
    }
}
