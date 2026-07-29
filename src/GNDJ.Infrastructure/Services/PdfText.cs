namespace GNDJ.Infrastructure.Services;

// Small text helpers shared by the PDF-generating services (trombinoscope, member card) so photo
// placeholders render consistently.
internal static class PdfText
{
    // Initials for a photo placeholder: first + last word initial (e.g. "Jean Dupont" -> "JD"),
    // a single initial for a one-word name, "?" when there's nothing usable.
    public static string GetInitials(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "?";
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 2) return $"{parts[0][0]}{parts[^1][0]}";
        if (parts.Length == 1) return parts[0][..1];
        return "?";
    }
}
