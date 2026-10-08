using GNDJ.Application.Demandes;

namespace GNDJ.Application.Tests;

// Name rules behind the « Déjà membre ? » flag (DemandeMemberMatch).
public class DemandeMemberMatchTests
{
    [Theory]
    [InlineData("Abi-Nassif", "abi nassif")]
    [InlineData("Mattéo", "matteo")]
    [InlineData("  EL ASMAR ", "elasmar")]
    public void Key_ignores_accents_case_spaces_and_hyphens(string a, string b) =>
        Assert.Equal(DemandeMemberMatch.Key(a), DemandeMemberMatch.Key(b));

    [Theory]
    [InlineData("mateo", "matteo", true)]   // one letter apart
    [InlineData("jean", "jeanpaul", true)]  // one contains the other
    [InlineData("christopher", "kristofer", false)] // too far
    [InlineData("leo", "lea", true)]        // short names: 1 letter allowed
    [InlineData("leo", "luc", false)]
    [InlineData("", "leo", false)]
    public void CloseNames(string a, string b, bool expected) =>
        Assert.Equal(expected, DemandeMemberMatch.CloseNames(a, b));
}
