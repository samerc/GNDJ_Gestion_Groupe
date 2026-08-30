using GNDJ.Application.Demandes;

namespace GNDJ.Application.Tests;

// Rejection reasons are a CG-managed JSON list. A typed Décision-cell code resolves to a reason (whose text is
// emailed to the parent); "--"/"-" is shorthand for the default reason. Resolution is accent/case-insensitive.
public class DemandeRejectionReasonsTests
{
    private static readonly List<DemandeRejectionReasonDto> Reasons =
    [
        new("PLACE", "Manque de place", "Nous manquons de place cette année.", IsDefault: true),
        new("AGE", "Âge", "L'enfant ne correspond pas à la tranche d'âge.", IsDefault: false),
    ];

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("{ not json }")]
    public void Parse_returns_empty_for_blank_or_invalid_json(string? json)
    {
        Assert.Empty(DemandeRejectionReasons.Parse(json));
    }

    [Fact]
    public void Serialize_then_Parse_roundtrips_and_drops_codeless_entries()
    {
        var input = new List<DemandeRejectionReasonDto>
        {
            new(" PLACE ", " Manque de place ", " Texte ", IsDefault: true),
            new("", "Sans code", "ignorée", IsDefault: false), // dropped (no code)
        };
        var parsed = DemandeRejectionReasons.Parse(DemandeRejectionReasons.Serialize(input));
        Assert.Single(parsed);
        Assert.Equal("PLACE", parsed[0].Code);       // trimmed
        Assert.Equal("Manque de place", parsed[0].Label);
        Assert.True(parsed[0].IsDefault);
    }

    [Theory]
    [InlineData("--")]
    [InlineData("-")]
    public void Resolve_dashes_to_the_default_reason(string code)
    {
        var r = DemandeRejectionReasons.Resolve(Reasons, code);
        Assert.NotNull(r);
        Assert.Equal("PLACE", r!.Code);
    }

    [Theory]
    [InlineData("AGE")]
    [InlineData("age")]     // case-insensitive
    [InlineData(" âge ")]   // matches by LABEL? no — code match, accent/case-insensitive on the code
    public void Resolve_matches_a_code_case_insensitively(string code)
    {
        // Note: matching is on the CODE. "age"/"AGE" resolve; " âge " normalizes to "age" and also resolves.
        var r = DemandeRejectionReasons.Resolve(Reasons, code);
        Assert.NotNull(r);
        Assert.Equal("AGE", r!.Code);
    }

    [Fact]
    public void Resolve_returns_null_for_an_unknown_code()
    {
        Assert.Null(DemandeRejectionReasons.Resolve(Reasons, "ZZZ"));
    }

    [Fact]
    public void TextOf_falls_back_to_the_label_when_text_is_blank()
    {
        Assert.Equal("Une raison", DemandeRejectionReasons.TextOf(new("X", "Une raison", "", false)));
        Assert.Equal("Le texte long", DemandeRejectionReasons.TextOf(new("X", "Une raison", "Le texte long", false)));
    }
}
