using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.SystemHealth;

// A problem found in the configuration. Severity "error" = something will misbehave (dates out of order, a
// template placeholder that will reach families unfilled); "warning" = worth a look. Tab = the Paramètres tab to
// open (a category key, "cfg:email-templates", or a page path starting with "/"), Keys = the settings / template codes involved.
public record ConfigIssue(string Severity, string Message, string? Tab, List<string> Keys);

// Consistency checks over settings and email templates. Pure reads; used by the Paramètres banner, the email
// templates page, the Système page, the daily ops alert and the smoke suite, so they all agree.
public static partial class ConfigurationChecks
{
    public static async Task<List<ConfigIssue>> SettingsAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var s = await context.Settings.AsNoTracking().ToDictionaryAsync(x => x.Key, x => x.Value ?? "", ct);
        string Get(string k) => s.TryGetValue(k, out var v) ? v.Trim() : "";
        DateOnly? Date(string k) =>
            DateOnly.TryParseExact(Get(k), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
        static string Fr(DateOnly d) => d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

        var issues = new List<ConfigIssue>();

        // 1. Scout years: well-formed (YYYY-YYYY+1) and the same everywhere.
        var yearKeys = new[] { "passage.scout_year", "demande.scout_year", "documents.scout_year" };
        foreach (var k in yearKeys)
        {
            var v = Get(k);
            if (v == "") continue;
            var m = ScoutYearRegex().Match(v);
            if (!m.Success || int.Parse(m.Groups[2].Value) != int.Parse(m.Groups[1].Value) + 1)
                issues.Add(new("error", $"L'année scoute « {v} » n'est pas au format 2026-2027.", CategoryOf(k), [k]));
        }
        var years = yearKeys.Select(Get).Where(v => v != "").Distinct().ToList();
        if (years.Count > 1)
            issues.Add(new("warning",
                $"Les années scoutes ne sont pas les mêmes partout ({string.Join(", ", years)}) : passage, inscriptions et documents.",
                "passage", yearKeys.ToList()));

        // 2. Enrollment window: opening before the deadline.
        if (Date("demande.submission_start") is { } ds && Date("demande.submission_deadline") is { } dd && ds > dd)
            issues.Add(new("error", $"Inscriptions : la date d'ouverture ({Fr(ds)}) est après la date limite ({Fr(dd)}).",
                "demande", ["demande.submission_start", "demande.submission_deadline"]));

        // 3. Document campaign: the five dates must be in order, else the phases misbehave.
        var campaign = new (string Key, string Label)[]
        {
            ("documents.deposit_start", "ouverture du dépôt"), ("documents.deposit_deadline", "fin du dépôt"),
            ("documents.correction_start", "début des corrections"), ("documents.correction_deadline", "fin des corrections"),
            ("documents.final_deadline", "date limite finale"),
        };
        var dated = campaign.Select(c => (c.Key, c.Label, D: Date(c.Key))).Where(c => c.D is not null).ToList();
        for (var i = 1; i < dated.Count; i++)
            if (dated[i].D < dated[i - 1].D)
                issues.Add(new("error",
                    $"Campagne de documents : « {dated[i].Label} » ({Fr(dated[i].D!.Value)}) est avant « {dated[i - 1].Label} » ({Fr(dated[i - 1].D!.Value)}).",
                    "/admin/documents-suivi", [dated[i - 1].Key, dated[i].Key]));

        // 4. Every email is redirected to a test address.
        if (Get("email.override_recipient") != "")
            issues.Add(new("warning",
                $"Mode test des emails actif : tous les emails partent vers {Get("email.override_recipient")} au lieu des vrais destinataires.",
                "email", ["email.override_recipient"]));

        // 5. The grade that can't enroll must exist in the classes list, else nothing is excluded.
        var excluded = Get("demande.excluded_classe");
        var classes = JsonList(Get("member.classes"));
        if (excluded != "" && classes.Count > 0 && !classes.Contains(excluded, StringComparer.OrdinalIgnoreCase))
            issues.Add(new("warning", $"La classe exclue des inscriptions « {excluded} » ne figure pas dans la liste des classes.",
                "demande", ["demande.excluded_classe", "member.classes"]));

        // 6. Cotisation amounts in an undefined currency; non-positive amounts / exchange rates.
        var rates = JsonMap(Get("cotisation.exchange_rates"));
        var currencies = new HashSet<string>(rates.Keys, StringComparer.OrdinalIgnoreCase);
        var reference = Get("cotisation.default_currency");
        if (reference != "") currencies.Add(reference);
        foreach (var (cur, amount) in JsonMap(Get("cotisation.full_amounts")))
        {
            if (!currencies.Contains(cur))
                issues.Add(new("warning", $"Cotisation : un montant est défini en {cur}, qui n'est pas dans la liste des devises.",
                    "cotisations", ["cotisation.full_amounts"]));
            if (amount <= 0)
                issues.Add(new("error", $"Cotisation : le montant en {cur} doit être supérieur à 0.",
                    "cotisations", ["cotisation.full_amounts"]));
        }
        foreach (var (cur, rate) in rates)
            if (rate <= 0)
                issues.Add(new("error", $"Cotisation : le taux de change de {cur} doit être supérieur à 0.",
                    "cotisations", ["cotisation.exchange_rates"]));

        // 7. Where error alerts go.
        if (Get("error.notify_email") == "")
            issues.Add(new("warning",
                "Aucune adresse ne reçoit les alertes d'erreur (error.notify_email) : elles vont au premier super-administrateur.",
                "email", ["error.notify_email"]));

        return issues;
    }

    // Email templates: a {{variable}} missing from the template's declared list, or a broken placeholder, would
    // reach the recipient as-is ("Bonjour {{memberNme}}"). Active templates only.
    public static async Task<List<ConfigIssue>> EmailTemplatesAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var templates = await context.EmailTemplates.AsNoTracking().Where(t => t.IsActive)
            .Select(t => new { t.Name, t.Code, t.Subject, t.BodyHtml, t.Variables }).ToListAsync(ct);
        var issues = new List<ConfigIssue>();
        foreach (var t in templates.OrderBy(t => t.Name))
        {
            var text = (t.Subject ?? "") + "\n" + (t.BodyHtml ?? "");
            var matches = PlaceholderRegex().Matches(text);
            var used = matches.Select(m => m.Groups[1].Value).Distinct().ToList();
            var declared = DeclaredKeys(t.Variables);
            var unknown = declared is null ? [] : used.Where(u => !declared.Contains(u)).ToList();
            if (unknown.Count > 0)
                issues.Add(new("error",
                    $"Modèle « {t.Name} » : {string.Join(", ", unknown.Select(u => "{{" + u + "}}"))} ne sera pas remplacé (variable inconnue).",
                    "cfg:email-templates", [t.Code]));

            // Every "{{" and "}}" must belong to a well-formed placeholder.
            var opens = OpenRegex().Matches(text).Count;
            var closes = CloseRegex().Matches(text).Count;
            if (opens != matches.Count || closes != matches.Count)
                issues.Add(new("error", $"Modèle « {t.Name} » : une variable entre accolades est mal écrite ou mal fermée.",
                    "cfg:email-templates", [t.Code]));
        }
        return issues;
    }

    // null = the list can't be read (then no "unknown variable" is reported — we'd only be guessing).
    private static HashSet<string>? DeclaredKeys(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return null;
            return doc.RootElement.EnumerateArray()
                .Select(e => e.ValueKind == JsonValueKind.Object && e.TryGetProperty("key", out var k) ? k.GetString() : null)
                .Where(k => !string.IsNullOrEmpty(k)).Select(k => k!).ToHashSet();
        }
        catch (JsonException) { return null; }
    }

    private static List<string> JsonList(string json)
    {
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? []; } catch { return []; }
    }

    private static Dictionary<string, decimal> JsonMap(string json)
    {
        try { return JsonSerializer.Deserialize<Dictionary<string, decimal>>(json) ?? []; } catch { return []; }
    }

    private static string CategoryOf(string key) => key.Split('.')[0] switch
    {
        "demande" => "demande",
        "documents" => "documents",
        _ => "passage",
    };

    [GeneratedRegex(@"^(\d{4})-(\d{4})$")] private static partial Regex ScoutYearRegex();
    [GeneratedRegex(@"\{\{\s*([A-Za-z0-9_]+)\s*\}\}")] private static partial Regex PlaceholderRegex();
    [GeneratedRegex(@"\{\{")] private static partial Regex OpenRegex();
    [GeneratedRegex(@"\}\}")] private static partial Regex CloseRegex();
}
