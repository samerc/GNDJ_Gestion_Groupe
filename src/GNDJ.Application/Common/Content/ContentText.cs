using System.Text.RegularExpressions;

namespace GNDJ.Application.Common.Content;

// Slug + plain-text-excerpt helpers for CMS content (news, pages). Slugs are generated from the title
// (the admin no longer types them); excerpts are derived from the HTML body for list previews.
public static partial class ContentText
{
    public static string Slugify(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return "page";
        var s = input.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD);
        var sb = new System.Text.StringBuilder();
        foreach (var ch in s)
        {
            var cat = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch);
            if (cat != System.Globalization.UnicodeCategory.NonSpacingMark) sb.Append(ch);
        }
        var slug = NonSlugChars().Replace(sb.ToString().Normalize(System.Text.NormalizationForm.FormC), "-");
        slug = slug.Trim('-');
        if (slug.Length > 120) slug = slug[..120].Trim('-');
        return string.IsNullOrEmpty(slug) ? "page" : slug;
    }

    // Strip HTML tags + collapse whitespace → plain text, truncated for a list preview.
    public static string? Excerpt(string? html, int max = 300)
    {
        if (string.IsNullOrWhiteSpace(html)) return null;
        var text = TagRegex().Replace(html, " ");
        text = System.Net.WebUtility.HtmlDecode(text);
        text = WhitespaceRegex().Replace(text, " ").Trim();
        if (text.Length == 0) return null;
        return text.Length <= max ? text : text[..max].TrimEnd() + "…";
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugChars();
    [GeneratedRegex("<[^>]+>")]
    private static partial Regex TagRegex();
    [GeneratedRegex("\\s+")]
    private static partial Regex WhitespaceRegex();
}
