namespace GNDJ.Application.Common;

// « Ce qui va se passer » — what a big one-shot action (Envoyer les réponses, Publier le passage) WILL do, computed
// from the same data and the same rules as the action itself, shown in its confirmation dialog before anything happens.
//   • Blockers — why the action would be refused right now (same gates as the command); the button stays disabled.
//   • Lines    — the numbers ("161 membres créés"), with an optional detail ("M2 : 12 · T3 : 8").
//   • Warnings — things that will go through but deserve a look (a family with no email, a unit with no chef d'unité).
public record ActionPreviewLine(string Label, int Count, string? Detail = null);

public record ActionPreviewDto(List<ActionPreviewLine> Lines, List<string> Warnings, List<string> Blockers);

public static class ActionPreviewText
{
    // Natural order for unit codes in a detail line (M2 before M10).
    public static string NaturalKey(string code) =>
        System.Text.RegularExpressions.Regex.Replace(code, @"\d+", m => m.Value.PadLeft(6, '0'));
}
