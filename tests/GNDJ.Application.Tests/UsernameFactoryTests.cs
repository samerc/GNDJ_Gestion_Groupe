using GNDJ.Application.Common;

namespace GNDJ.Application.Tests;

// The login username rules (prenom.nom@domain): clean name parts, then the father's initial, then a number.
public class UsernameFactoryTests
{
    [Theory]
    [InlineData("Jean Marie", "jeanmarie")]
    [InlineData("D'Amour", "damour")]
    [InlineData("Jean-Paul", "jean-paul")]
    [InlineData("  ÉLODIE ", "elodie")]
    [InlineData("Núñez", "nunez")]
    [InlineData("Cœur", "coeur")]
    [InlineData("Anthony, Victor", "anthonyvictor")]
    [InlineData("St. John", "stjohn")]
    [InlineData("-Abi--Nassif-", "abi-nassif")]
    [InlineData("Kate É.", "katee")]
    public void Normalize_keeps_only_letters_digits_and_inner_hyphens(string input, string expected)
        => Assert.Equal(expected, UsernameFactory.Normalize(input));

    [Fact]
    public void Full_example_from_the_cg()
        => Assert.Equal("jeanmarie.damour@scouts.gndj",
            UsernameFactory.Candidates("Jean Marie", "D'Amour", null, "scouts.gndj").First());

    [Fact]
    public void Duplicate_uses_father_initial_then_a_number()
    {
        var taken = new HashSet<string> { "jad.khalil@scouts.gndj", "jad.e.khalil@scouts.gndj" };
        Assert.Equal("jad.e.khalil2@scouts.gndj", UsernameFactory.PickUnique("Jad", "Khalil", "Élie", "scouts.gndj", taken.Contains));
        Assert.Equal("jad.e.khalil@scouts.gndj",
            UsernameFactory.PickUnique("Jad", "Khalil", "Elie", "scouts.gndj", new HashSet<string> { "jad.khalil@scouts.gndj" }.Contains));
    }

    [Fact]
    public void Duplicate_without_father_goes_to_a_number()
        => Assert.Equal("jad.khalil2@scouts.gndj",
            UsernameFactory.PickUnique("Jad", "Khalil", null, "scouts.gndj", new HashSet<string> { "jad.khalil@scouts.gndj" }.Contains));
}
