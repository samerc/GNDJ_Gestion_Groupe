using System.Globalization;
using System.Text;
using System.Text.Json;

namespace GNDJ.Application.Common;

// Resolves a full school name to its short code for reports (e.g. "Collège Notre-Dame de Jamhour" → "CNDJ",
// "Collège Saint-Grégoire" → "CSG"). The mapping comes from the `member.school_codes` setting
// (JSON: {"Full Name":"CODE", ...}); matching is accent- and case-insensitive. A school that has NO code in
// the mapping keeps its FULL name (we only abbreviate the schools we've explicitly assigned a code to).
// Used by the roster and export generators.
public static class SchoolCode
{
    // Build a resolver from the raw `member.school_codes` setting value (may be null/blank/invalid).
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
            catch { /* malformed setting → no codes, full names kept */ }
        }

        return name =>
        {
            if (string.IsNullOrWhiteSpace(name)) return "";
            // Mapped → short code; otherwise keep the full name as-is.
            return map.TryGetValue(Normalize(name), out var code) ? code : name.Trim();
        };
    }

    private static string Normalize(string s) => TextNormalization.NormalizeKey(s);
}
