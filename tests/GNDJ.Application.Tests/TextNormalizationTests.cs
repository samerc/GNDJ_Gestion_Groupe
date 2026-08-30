using GNDJ.Application.Common;

namespace GNDJ.Application.Tests;

// Accent/case-insensitive matching underpins school/city/profession dedup, demande statistics grouping and
// sibling/duplicate detection. If RemoveDiacritics/NormalizeKey drifted, near-duplicate spellings would stop
// collapsing (or wrongly collapse), so pin the behaviour.
public class TextNormalizationTests
{
    [Theory]
    [InlineData("Éliane", "Eliane")]
    [InlineData("François", "Francois")]
    [InlineData("Beyrouth", "Beyrouth")]      // no accents → unchanged
    [InlineData("Collège", "College")]
    [InlineData("Féminin", "Feminin")]
    [InlineData("àâäçéèêëîïôùûü", "aaaceeeeiiouuu")]
    public void RemoveDiacritics_strips_accents_only(string input, string expected)
    {
        Assert.Equal(expected, TextNormalization.RemoveDiacritics(input));
    }

    [Theory]
    [InlineData("  Féminin ", "feminin")]
    [InlineData("Collège La Sagesse", "college la sagesse")]
    [InlineData("MÊME", "meme")]
    public void NormalizeKey_trims_lowercases_and_strips_accents(string input, string expected)
    {
        Assert.Equal(expected, TextNormalization.NormalizeKey(input));
    }

    [Fact]
    public void NormalizeKey_collapses_accent_and_case_variants_to_one_bucket()
    {
        // "Féminin" and "feminin" must land in the same normalized bucket (the whole point of the helper).
        Assert.Equal(TextNormalization.NormalizeKey("Féminin"), TextNormalization.NormalizeKey("FEMININ"));
    }
}
