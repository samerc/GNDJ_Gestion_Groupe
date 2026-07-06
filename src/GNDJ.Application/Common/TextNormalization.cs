using System.Globalization;
using System.Text;

namespace GNDJ.Application.Common;

// Shared Unicode text-normalization helpers. RemoveDiacritics decomposes to FormD, strips combining
// marks, then recomposes to FormC — the basis for accent-insensitive matching/grouping (schools,
// cities, demande statistics). NormalizeKey is the common trim + lowercase + strip-accents lookup key.
// Consolidated here so the identical routine isn't copy-pasted across handlers.
public static class TextNormalization
{
    public static string RemoveDiacritics(string text)
    {
        var decomposed = text.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }

    // Common lookup-key form: strip accents, lowercase, trim.
    public static string NormalizeKey(string s) => RemoveDiacritics(s).ToLowerInvariant().Trim();
}
