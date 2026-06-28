using System.Globalization;
using System.Text;
using System.Text.Json;

namespace GNDJ.Application.Common;

// Resolves a full school name to its short code for reports (e.g. "Collège Notre-Dame de Jamhour" → "CNDJ",
// "Collège Saint-Grégoire" → "CSG"). Mirrors the frontend `useSchoolCode`: the mapping comes from the
// `member.school_codes` setting (JSON: {"Full Name":"CODE", ...}); matching is accent- and case-insensitive;
// a school with no explicit code falls back to an acronym of its significant words. Used by the roster and
// export generators so every report shows the code instead of the long name.
public static class SchoolCode
{
    private static readonly HashSet<string> SkipWords =
        new(StringComparer.OrdinalIgnoreCase) { "de", "du", "la", "le", "les", "des", "et", "d'", "of" };

    // Build a resolver from the raw `member.school_codes` setting value (may be null/blank/invalid → acronym only).
    public static Func<string?, string> Resolver(string? schoolCodesJson)
    {
        var map = new Dictionary<string, string>();
        if (!string.IsNullOrWhiteSpace(schoolCodesJson))
        {
            try
            {
                var raw = JsonSerializer.Deserialize<Dictionary<string, string>>(schoolCodesJson);
                if (raw is not null)
                    foreach (var kv in raw)
                        map[Normalize(kv.Key)] = kv.Value;
            }
            catch { /* malformed setting → fall back to acronyms */ }
        }

        return name =>
        {
            if (string.IsNullOrWhiteSpace(name)) return "";
            return map.TryGetValue(Normalize(name), out var code) ? code : Acronym(name);
        };
    }

    private static string Normalize(string s) => RemoveDiacritics(s.Trim().ToLowerInvariant());

    // Initials of the significant words (skipping articles/prepositions), capped at 4 chars.
    private static string Acronym(string name)
    {
        var words = name.Split([' ', '-'], StringSplitOptions.RemoveEmptyEntries)
            .Where(w => !SkipWords.Contains(w));
        var code = string.Concat(words.Select(w => char.ToUpperInvariant(w[0])));
        if (code.Length > 4) code = code[..4];
        if (!string.IsNullOrEmpty(code)) return code;
        return (name.Length >= 4 ? name[..4] : name).ToUpperInvariant();
    }

    private static string RemoveDiacritics(string text)
    {
        var normalized = text.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);
        foreach (var c in normalized)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
}
