namespace GNDJ.Application.Common.Interfaces;

// Renders an in-app document template (TipTap/HTML authored by the CG) to a PDF, substituting {{champs}}
// with a member's resolved field values. Implemented with HtmlAgilityPack (parse) + QuestPDF (layout) in
// Infrastructure. `values` maps placeholder key → resolved text (a missing/blank value renders empty, leaving
// a blank the member completes by hand). The document's title/heading is authored in the template itself.
//
// Online filling (« Remplir en ligne »): every blank of the template (fill line, box, checkbox) gets a stable key
// "f0", "f1"… in document order. PrepareForm returns the template with those keys + the member's values already
// written in, for the phone form; Render then accepts the answers (TemplateFormAnswers.Key("f3") → value, "1" for a
// ticked checkbox) and an optional signature block printed at the end.
public interface IDocumentTemplateRenderer
{
    byte[] Render(string html, IReadOnlyDictionary<string, string?> values, TemplateSignature? signature = null);

    TemplateForm PrepareForm(string html, IReadOnlyDictionary<string, string?> values);
}

// One blank of the form: Kind = "fill" (one line), "date" (a line answered with the date picker), "box" (several
// lines), "checkbox", or "signature" (a fill line labelled « Signature » — the drawn signature is printed there
// instead of in a block at the end). Save = the member-file field the answer is saved into when signed online
// (allergies | medicalNotes), Label = the text just before the blank (or the heading above a box).
// Required = the blank must be answered to sign online (data-required, set per blank in the template builder).
public record TemplateFormField(string Key, string Kind, string? Save = null, string? Label = null, bool Required = false);
public record TemplateForm(string Html, IReadOnlyList<TemplateFormField> Fields);

// The signature printed at the bottom of an online-filled form: the drawn image (PNG) + who signed and when.
public record TemplateSignature(byte[] ImagePng, string SignerName, string SignerRelation, string SignedAt, string Reference);

public static class TemplateFormAnswers
{
    // Answers travel in the same values dictionary under a prefix that can't clash with {{tokens}} ([a-zA-Z0-9_]).
    public static string Key(string fieldKey) => "#" + fieldKey;

    // A date answer (yyyy-MM-dd from the date picker) shown as JJ/MM/AAAA; anything else unchanged.
    // An accepted date-blank answer: yyyy-MM-dd, MM/yyyy (month 01-12) or yyyy (years 1900-2100).
    public static bool IsFormDate(string v)
    {
        if (DateOnly.TryParseExact(v, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out _)) return true;
        var m = System.Text.RegularExpressions.Regex.Match(v, @"^(?:(\d{2})/)?(\d{4})$");
        if (!m.Success) return false;
        var year = int.Parse(m.Groups[2].Value);
        if (year < 1900 || year > 2100) return false;
        return !m.Groups[1].Success || int.Parse(m.Groups[1].Value) is >= 1 and <= 12;
    }

    public static string DisplayDate(string v)
        => DateOnly.TryParseExact(v, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d)
            ? d.ToString("dd/MM/yyyy", System.Globalization.CultureInfo.InvariantCulture) : v;

    // Member-file fields an answer can be saved into (data-save on a blank).
    public const string SaveAllergies = "allergies";
    public const string SaveMedicalNotes = "medicalNotes";
    public const string SaveBloodType = "bloodType";
    public static readonly string[] BloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
}
