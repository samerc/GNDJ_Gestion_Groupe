using System.Text.RegularExpressions;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Domain.Enums;

namespace GNDJ.Api.Help;

// The in-app "Aide" guides. Each guide is a Markdown file in docs/help (shipped to <output>/HelpDocs; read straight
// from the repo in Development so edits show without a rebuild) with a small front-matter block:
//   ---
//   title: Guide du chef d'unité
//   audience: cu              public | member | cu | cg | admin | dev
//   order: 30
//   summary: One line shown on the guide list
//   ---
// Screenshots/diagram images live in docs/help/img. Access is decided HERE, on the server (a guide bundled into
// the frontend would be downloadable by anyone): public = everyone (the enrolment guide, also shown to families
// in the portal); member = any signed-in member; cu = unit leaders (members.edit); cg = group managers
// (maitrise.manage); admin + dev = super-admin. Higher roles see everything below them.
public record HelpDocSummary(string Slug, string Title, string Audience, int Order, string? Summary, List<string> Sections);
public record HelpDoc(string Slug, string Title, string Audience, string? Summary, string Markdown);
public record HelpSearchHit(string Slug, string Title, string Section, string Snippet);

public partial class HelpDocs
{
    private sealed record Entry(string Slug, string Title, string Audience, int Order, string? Summary, string Body, List<string> Sections);

    public static readonly string[] Audiences = ["public", "member", "cu", "cg", "admin", "dev"];

    private readonly string _root;
    private readonly bool _reloadEachTime; // Development: re-read files so writing a guide shows immediately
    private List<Entry>? _cache;
    private HashSet<string>? _publicImages;
    private readonly Lock _lock = new();

    public HelpDocs(IWebHostEnvironment env, IConfiguration config)
    {
        var configured = config["Help:Directory"];
        var repoDocs = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "..", "docs", "help"));
        _root = !string.IsNullOrWhiteSpace(configured) ? configured
            : env.IsDevelopment() && Directory.Exists(repoDocs) ? repoDocs
            : Path.Combine(AppContext.BaseDirectory, "HelpDocs");
        _reloadEachTime = env.IsDevelopment();
    }

    // ---------------------------------------------------------------------------------------------- access

    public static bool CanRead(string audience, ICurrentUserService user) => audience switch
    {
        "public" => true,
        "member" => user.MemberId is not null || user.IsSuperAdmin,
        "cu" => user.IsSuperAdmin || user.Permissions.Contains(Permissions.MembersEdit) || MemberAccess.IsGroupManager(user),
        "cg" => MemberAccess.IsGroupManager(user),
        "admin" or "dev" => user.IsSuperAdmin,
        _ => false,
    };

    // ---------------------------------------------------------------------------------------------- reads

    public List<HelpDocSummary> List(ICurrentUserService user) =>
        Load().Where(e => CanRead(e.Audience, user))
            .OrderBy(e => Array.IndexOf(Audiences, e.Audience)).ThenBy(e => e.Order).ThenBy(e => e.Title)
            .Select(e => new HelpDocSummary(e.Slug, e.Title, e.Audience, e.Order, e.Summary, e.Sections)).ToList();

    public HelpDoc? Get(string slug, ICurrentUserService user)
    {
        var e = Load().FirstOrDefault(d => d.Slug.Equals(slug, StringComparison.OrdinalIgnoreCase));
        return e is null || !CanRead(e.Audience, user) ? null : new HelpDoc(e.Slug, e.Title, e.Audience, e.Summary, e.Body);
    }

    // Accent/case-insensitive search over the guides the caller may read. One hit per matching section (h2/h3),
    // ranked by how many query words it contains.
    public List<HelpSearchHit> Search(string query, ICurrentUserService user)
    {
        var words = TextNormalization.NormalizeKey(query).Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length >= 2).ToArray();
        if (words.Length == 0) return [];
        var hits = new List<(int Score, HelpSearchHit Hit)>();
        foreach (var e in Load().Where(e => CanRead(e.Audience, user)))
        {
            foreach (var (section, text) in SplitSections(e))
            {
                var plain = PlainText(text);
                var norm = TextNormalization.NormalizeKey(section + " " + plain);
                var score = words.Count(norm.Contains);
                if (score < words.Length) continue; // every word must appear
                hits.Add((score + (TextNormalization.NormalizeKey(section).Contains(words[0]) ? 5 : 0),
                    new HelpSearchHit(e.Slug, e.Title, section, Snippet(plain, words[0]))));
            }
        }
        return hits.OrderByDescending(h => h.Score).Take(30).Select(h => h.Hit).ToList();
    }

    // Path of an image, or null. Anonymous callers may only get images used by a public guide.
    public string? ImagePath(string file, bool authenticated)
    {
        if (string.IsNullOrWhiteSpace(file) || file.Contains("..") || file.Contains('/') || file.Contains('\\')) return null;
        Load();
        if (!authenticated && _publicImages?.Contains(file) != true) return null;
        var dir = Path.GetFullPath(Path.Combine(_root, "img"));
        var path = Path.GetFullPath(Path.Combine(dir, file));
        return path.StartsWith(dir, StringComparison.OrdinalIgnoreCase) && File.Exists(path) ? path : null;
    }

    // ---------------------------------------------------------------------------------------------- loading

    private List<Entry> Load()
    {
        lock (_lock)
        {
            if (_cache is not null && !_reloadEachTime) return _cache;
            var list = new List<Entry>();
            if (Directory.Exists(_root))
                foreach (var file in Directory.EnumerateFiles(_root, "*.md", SearchOption.TopDirectoryOnly))
                {
                    var entry = Parse(Path.GetFileNameWithoutExtension(file), File.ReadAllText(file));
                    if (entry is not null) list.Add(entry);
                }
            _cache = list;
            _publicImages = list.Where(e => e.Audience == "public")
                .SelectMany(e => ImageRefRegex().Matches(e.Body).Select(m => m.Groups[1].Value))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            return list;
        }
    }

    private static Entry? Parse(string slug, string text)
    {
        text = text.Replace("\r\n", "\n");
        if (!text.StartsWith("---\n")) return null; // no front matter = not a guide (e.g. a README)
        var end = text.IndexOf("\n---", 4, StringComparison.Ordinal);
        if (end < 0) return null;
        var meta = text[4..end].Split('\n')
            .Select(l => l.Split(':', 2)).Where(p => p.Length == 2)
            .ToDictionary(p => p[0].Trim().ToLowerInvariant(), p => p[1].Trim());
        var body = text[(end + 4)..].TrimStart('\n');
        var audience = meta.GetValueOrDefault("audience", "admin").ToLowerInvariant();
        if (!Audiences.Contains(audience)) audience = "admin"; // unknown audience = most restrictive useful one
        var sections = HeadingRegex().Matches(body).Where(m => m.Groups[1].Value.Length == 2)
            .Select(m => m.Groups[2].Value.Trim()).ToList();
        return new Entry(slug, meta.GetValueOrDefault("title", slug), audience,
            int.TryParse(meta.GetValueOrDefault("order"), out var o) ? o : 100, meta.GetValueOrDefault("summary"), body, sections);
    }

    private static IEnumerable<(string Section, string Text)> SplitSections(Entry e)
    {
        var matches = HeadingRegex().Matches(e.Body);
        if (matches.Count == 0) { yield return (e.Title, e.Body); yield break; }
        if (matches[0].Index > 0) yield return (e.Title, e.Body[..matches[0].Index]);
        for (var i = 0; i < matches.Count; i++)
        {
            var start = matches[i].Index;
            var stop = i + 1 < matches.Count ? matches[i + 1].Index : e.Body.Length;
            yield return (matches[i].Groups[2].Value.Trim(), e.Body[start..stop]);
        }
    }

    private static string PlainText(string md)
    {
        var s = CodeFenceRegex().Replace(md, " ");
        s = ImageMdRegex().Replace(s, " ");
        s = LinkMdRegex().Replace(s, "$1");
        s = MarkupRegex().Replace(s, " ");
        return SpaceRegex().Replace(s, " ").Trim();
    }

    private static string Snippet(string plain, string word)
    {
        var norm = TextNormalization.NormalizeKey(plain); // same length as plain for Latin text (diacritics dropped per char)
        var i = norm.IndexOf(word, StringComparison.Ordinal);
        if (i < 0 || norm.Length != plain.Length) return plain.Length > 160 ? plain[..160] + "…" : plain;
        var start = Math.Max(0, i - 60);
        var len = Math.Min(160, plain.Length - start);
        return (start > 0 ? "…" : "") + plain.Substring(start, len) + (start + len < plain.Length ? "…" : "");
    }

    [GeneratedRegex(@"^(#{2,3})\s+(.+)$", RegexOptions.Multiline)] private static partial Regex HeadingRegex();
    [GeneratedRegex(@"\]\((?:\./)?img/([^)\s]+)\)")] private static partial Regex ImageRefRegex();
    [GeneratedRegex(@"```[\s\S]*?```")] private static partial Regex CodeFenceRegex();
    [GeneratedRegex(@"!\[[^\]]*\]\([^)]*\)")] private static partial Regex ImageMdRegex();
    [GeneratedRegex(@"\[([^\]]*)\]\([^)]*\)")] private static partial Regex LinkMdRegex();
    [GeneratedRegex(@"[#>*_`|]|<[^>]+>")] private static partial Regex MarkupRegex();
    [GeneratedRegex(@"\s+")] private static partial Regex SpaceRegex();
}
