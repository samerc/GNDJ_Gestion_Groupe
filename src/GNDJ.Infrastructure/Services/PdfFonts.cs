using QuestPDF.Drawing;

namespace GNDJ.Infrastructure.Services;

// Fonts the PDF engine may use beyond its bundled default (Lato).
// Since QuestPDF 2026.9 system fonts are no longer picked up automatically, and a text block naming an unknown
// family FAILS the whole document instead of falling back. The document-template builder lets chefs pick a few
// Windows fonts (client: FONT_FAMILIES in rich-text-editor.tsx), so those files are registered once at startup
// from the Windows font folder, and the renderer only applies a family that actually got registered.
public static class PdfFonts
{
    // File-name prefixes in %WINDIR%\Fonts of the families the template builder offers (regular/bold/italic files).
    private static readonly string[] FilePrefixes = ["arial", "times", "georgia", "verdana", "tahoma", "calibri", "cour"];

    private static HashSet<string> _families = new(StringComparer.OrdinalIgnoreCase);

    public static void Register()
    {
        var dir = Environment.GetFolderPath(Environment.SpecialFolder.Fonts);
        if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir))
        {
            foreach (var file in Directory.EnumerateFiles(dir, "*.ttf"))
            {
                var name = Path.GetFileNameWithoutExtension(file);
                // Only the curated families — registering the whole folder would load hundreds of fonts.
                if (!FilePrefixes.Any(p => name.StartsWith(p, StringComparison.OrdinalIgnoreCase))) continue;
                try
                {
                    using var stream = File.OpenRead(file);
                    FontManager.RegisterFontFromStream(stream);
                }
                catch (Exception)
                {
                    // An unreadable/odd font file just isn't offered — text using it falls back to the default.
                }
            }
        }
        _families = new HashSet<string>(
            FontManager.GetRegisteredFonts().Select(f => f.FamilyName), StringComparer.OrdinalIgnoreCase);
    }

    // True when a template's font-family can be rendered; otherwise the caller keeps the default font.
    public static bool IsAvailable(string family) => _families.Contains(family);
}
