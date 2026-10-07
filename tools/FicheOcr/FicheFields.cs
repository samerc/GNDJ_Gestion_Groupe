using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;

namespace FicheOcr;

/// <summary>Kind of a fiche field: drives the check done on the model's answer.</summary>
public enum FieldKind { Text, Date, BloodType }

/// <summary>One field of the fiche médicale. Label = the label of the matching blank in the online form, so the
/// checked Excel can later pre-fill the online form (matched by label).</summary>
public record FicheField(string Key, string Label, FieldKind Kind, string Hint);

public static class FicheFields
{
    public const string Unreadable = "ILLISIBLE";

    public static readonly string[] BloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

    // Order = the order of the paper fiche (and of the Excel columns).
    public static readonly FicheField[] All =
    [
        new("groupeSanguin", "Groupe sanguin", FieldKind.BloodType, "blood group, e.g. O+, A-, AB+"),
        new("vaccinDtp", "Anti diphtérique, tétanos et polio", FieldKind.Date, "date of last booster"),
        new("vaccinHepatiteA", "Anti hépatite A", FieldKind.Date, "date of last booster"),
        new("vaccinTyphoide", "Anti typhoïdique Vi", FieldKind.Date, "date of last booster"),
        new("vaccinRor", "Anti ROR (rougeole, oreillons, rubéole)", FieldKind.Date, "date of last booster"),
        new("antecedents", "Antécédents médicaux et chirurgicaux", FieldKind.Text, "medical and surgical history"),
        new("maladieChronique", "Maladie chronique ou traitement à long terme actuellement suivi", FieldKind.Text, "chronic illness or long-term treatment"),
        new("allergiesAliments", "Aliments", FieldKind.Text, "food allergies (lactose, gluten…)"),
        new("allergiesMedicaments", "Médicaments", FieldKind.Text, "drug allergies"),
        new("allergiesAutre", "Autre", FieldKind.Text, "other allergies"),
        new("traitementCrise", "Traitement en cas de crise", FieldKind.Text, "treatment in case of a crisis"),
        new("regime", "Régime alimentaire spécifique", FieldKind.Text, "specific diet"),
        new("medecin", "Médecin de famille", FieldKind.Text, "family doctor: name and phone"),
        new("contactUrgence", "Personne à contacter en cas d'urgence", FieldKind.Text, "emergency contact: name and phone"),
        new("signataire", "Nom / Prénom (signataire)", FieldKind.Text, "name of the person who signed"),
        new("dateSignature", "Date de signature", FieldKind.Date, "date next to the signature"),
    ];

    /// <summary>The answers a leader must know about (allergies, illnesses, treatments): a real answer in one of them
    /// is flagged « Infos médicales à relire » so the checking can focus on those rows.</summary>
    static readonly HashSet<string> MedicalKeys =
        ["antecedents", "maladieChronique", "allergiesAliments", "allergiesMedicaments", "allergiesAutre", "traitementCrise", "regime"];

    /// <summary>The one spelling kept for « nothing to declare ».</summary>
    public const string No = "Non";

    // « nothing » as parents write it, compared without accents, case, spaces or punctuation.
    static readonly HashSet<string> NegativeKeys =
    [
        "", "non", "no", "na", "nan", "neant", "ras", "rien", "rienasignaler", "riendeparticulier", "aucun", "aucune",
        "x", "xx", "xnon", "nonx", "none", "nil", "nothing", "0", "pas", "pasdallergie", "pasdallergies", "sansobjet", "so",
        "nonapplicable", "notapplicable",
    ];

    // A tick or « oui » with nothing else: something is declared, but not what.
    static readonly HashSet<string> BareYesKeys = ["oui", "yes", "o", "v", "✓", "✔", "☑", "✅", "ok"];

    static string AnswerKey(string v) =>
        new string(RemoveDiacritics(v).ToLowerInvariant().Where(c => char.IsLetterOrDigit(c) || c is '✓' or '✔' or '☑' or '✅').ToArray());

    public static bool IsNegative(string v) => v.Length > 0 && NegativeKeys.Contains(AnswerKey(v));

    /// <summary>The instruction sent with the scan pages.</summary>
    public static string Prompt()
    {
        var sb = new StringBuilder();
        sb.AppendLine("The images are the pages of ONE scanned or photographed form, in French, from a scout group in Lebanon:");
        sb.AppendLine("a « fiche médicale » / « certificat médical » filled in by hand by a parent.");
        sb.AppendLine("Read it and return the answers written on it, as JSON, using exactly these keys:");
        foreach (var f in All) sb.AppendLine($"- {f.Key}: « {f.Label} » ({f.Hint})");
        sb.AppendLine("- estFicheMedicale: true if these pages are this medical form, false if it is another document");
        sb.AppendLine("- signee: true if a handwritten signature is present");
        sb.AppendLine();
        sb.AppendLine("Rules:");
        sb.AppendLine("- Copy what is HANDWRITTEN (or typed by the parent) exactly, in the original language. Do not translate, do not correct, do not guess.");
        sb.AppendLine("- Ignore the printed labels and instructions of the form; only return the answers.");
        sb.AppendLine("- Empty answer, a dash, or « non » / « aucun » / « RAS » written: return it as written (\"\" when nothing is written).");
        sb.AppendLine($"- Something is written but you cannot read it with confidence: return \"{Unreadable}\" for that key.");
        sb.AppendLine("- Dates: return them as DD/MM/YYYY when the full date is readable, otherwise as written.");
        sb.AppendLine("- If a page is rotated or upside down, still read it.");
        sb.AppendLine("- If these pages are NOT this medical form (an authorization, an ID card, another document): set estFicheMedicale to false and return \"\" for every answer.");
        return sb.ToString();
    }

    /// <summary>JSON schema given to Ollama (structured output) so the answer is always parseable.</summary>
    public static JsonObject Schema()
    {
        var props = new JsonObject();
        var required = new JsonArray();
        foreach (var f in All) { props[f.Key] = new JsonObject { ["type"] = "string" }; required.Add(f.Key); }
        props["estFicheMedicale"] = new JsonObject { ["type"] = "boolean" };
        props["signee"] = new JsonObject { ["type"] = "boolean" };
        required.Add("estFicheMedicale");
        required.Add("signee");
        return new JsonObject { ["type"] = "object", ["properties"] = props, ["required"] = required };
    }

    /// <summary>Cleans the model's values and lists what a human should check. Returns the cleaned values.</summary>
    public static Dictionary<string, string> Check(
        IReadOnlyDictionary<string, string> raw, bool isFiche, bool signed, string? memberBloodType, List<string> reasons)
    {
        var clean = new Dictionary<string, string>();
        var illegible = new List<string>();
        if (!isFiche)
        {
            // Another document uploaded as the fiche (an autorisation, an old form…): whatever the model read on it
            // is not a medical answer — keep the boxes empty and only say so.
            foreach (var f in All) clean[f.Key] = "";
            reasons.Add("Ce document ne semble pas être une fiche médicale");
            return clean;
        }
        foreach (var f in All)
        {
            var v = (raw.TryGetValue(f.Key, out var x) ? x : "").Trim();
            if (string.Equals(v, Unreadable, StringComparison.OrdinalIgnoreCase)) { clean[f.Key] = Unreadable; illegible.Add(f.Label); continue; }
            if (v.Length == 0) { clean[f.Key] = ""; continue; }
            if (IsNegative(v))
            {
                // « non », « N/A », « RAS », « Néant », « X »… → one spelling. A blood type « non » = not given.
                clean[f.Key] = f.Kind == FieldKind.BloodType ? "" : No;
                continue;
            }
            switch (f.Kind)
            {
                case FieldKind.BloodType:
                    var bt = NormalizeBloodType(v);
                    if (bt is null) { reasons.Add($"Groupe sanguin non reconnu : « {v} »"); clean[f.Key] = v; }
                    else
                    {
                        clean[f.Key] = bt;
                        var fiche = NormalizeBloodType(memberBloodType ?? "");
                        if (fiche is not null && fiche != bt) reasons.Add($"Groupe sanguin différent de la fiche ({fiche})");
                    }
                    break;
                case FieldKind.Date:
                    var (date, problem) = NormalizeDate(v);
                    clean[f.Key] = date;
                    if (problem is not null) reasons.Add($"{f.Label} : {problem}");
                    break;
                default:
                    clean[f.Key] = v;
                    if (MedicalKeys.Contains(f.Key) && BareYesKeys.Contains(AnswerKey(v)))
                        reasons.Add($"Coché ou « oui » sans précision : {f.Label}");
                    break;
            }
        }
        var medical = All.Where(f => MedicalKeys.Contains(f.Key)
                                     && clean[f.Key] is { Length: > 0 } a && a != No && a != Unreadable
                                     && !BareYesKeys.Contains(AnswerKey(a)))   // a bare tick has its own flag
                         .Select(f => f.Label).ToList();
        if (medical.Count > 0) reasons.Insert(0, "Infos médicales à relire : " + string.Join(", ", medical));
        if (illegible.Count > 0) reasons.Insert(0, "Illisible : " + string.Join(", ", illegible));
        if (clean.Values.All(v => v.Length == 0 || v == No)) reasons.Add("Aucune réponse lue (fiche vide ?)");
        if (!signed) reasons.Add("Pas de signature détectée");
        return clean;
    }

    /// <summary>« O positif », « 0+ », « o + » → O+. Null when not one of the 8 groups.</summary>
    public static string? NormalizeBloodType(string v)
    {
        var s = RemoveDiacritics(v).ToUpperInvariant().Replace(" ", "").Replace("RH", "");
        s = s.Replace("POSITIF", "+").Replace("POSITIVE", "+").Replace("POS", "+")
             .Replace("NEGATIF", "-").Replace("NEGATIVE", "-").Replace("NEG", "-").Replace("−", "-");
        if (s.StartsWith('0')) s = "O" + s[1..];
        return BloodTypes.Contains(s) ? s : null;
    }

    static readonly string[] DateFormats =
        ["d/M/yyyy", "d-M-yyyy", "d.M.yyyy", "d/M/yy", "d-M-yy", "d.M.yy", "yyyy-M-d", "d M yyyy"];

    // French month names / abbreviations → month number (keys without accents, lower case).
    static readonly (string Name, int Month)[] Months =
    [
        ("janvier", 1), ("janv", 1), ("jan", 1), ("fevrier", 2), ("fevr", 2), ("fev", 2), ("mars", 3), ("mar", 3),
        ("avril", 4), ("avr", 4), ("mai", 5), ("juin", 6), ("juillet", 7), ("juil", 7), ("aout", 8),
        ("septembre", 9), ("sept", 9), ("sep", 9), ("octobre", 10), ("oct", 10), ("novembre", 11), ("nov", 11),
        ("decembre", 12), ("dec", 12),
    ];

    /// <summary>Returns (value to keep, problem or null). A full date becomes DD/MM/YYYY; a year alone (« 2013 ») or
    /// a month and year (« 05/2013 ») is a valid answer on paper and is kept as written.</summary>
    public static (string Value, string? Problem) NormalizeDate(string v)
    {
        var s = v.Trim();
        // « 20 sept 2026 », « 20 septembre 2026 » → 20/9/2026
        var words = RemoveDiacritics(s).ToLowerInvariant().Replace(".", " ").Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length == 3 && Months.FirstOrDefault(m => m.Name == words[1]) is { Month: > 0 } month)
            s = $"{words[0]}/{month.Month}/{words[2]}";

        if (DateTime.TryParseExact(s, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
        {
            if (d.Year < 1990 || d > DateTime.Today.AddDays(1)) return (d.ToString("dd/MM/yyyy"), $"date improbable « {v} »");
            return (d.ToString("dd/MM/yyyy"), null);
        }
        var partial = System.Text.RegularExpressions.Regex.Match(s, @"^(?:(\d{1,2})\s*[/.-]\s*)?((?:19|20)\d{2})$");
        if (partial.Success)
        {
            var year = int.Parse(partial.Groups[2].Value, CultureInfo.InvariantCulture);
            var mon = partial.Groups[1].Success ? int.Parse(partial.Groups[1].Value, CultureInfo.InvariantCulture) : 1;
            if (year >= 1990 && year <= DateTime.Today.Year && mon is >= 1 and <= 12)
                return (partial.Groups[1].Success ? $"{mon:00}/{year}" : $"{year}", null);
            return (s, $"date improbable « {v} »");
        }
        // Answers such as « non », « - », « aucun » are not dates: keep them, no flag.
        if (!s.Any(char.IsDigit)) return (s, null);
        return (s, $"date incomplète ou non reconnue « {v} »");
    }

    static string RemoveDiacritics(string s)
    {
        var n = s.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(n.Length);
        foreach (var c in n)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
}
