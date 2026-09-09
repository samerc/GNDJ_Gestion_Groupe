using System.Globalization;
using System.Text.RegularExpressions;
using GNDJ.Application.Common.Interfaces;
using HtmlAgilityPack;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

// Renders a CG-authored in-app document template (the TipTap HTML subset) to an A4 PDF, substituting {{champs}}
// with a member's resolved values. Deliberately supports ONLY what the rich-text editor can produce
// (p, h1-h4, ul/ol/li, hr, br, strong/b, em/i, u, s, span, a, text-align) — anything else falls through to its
// text so a template never fails to render. A missing/blank value renders as an empty string, leaving a blank
// line the member fills and signs by hand (the "pick which fields prefill" behaviour).
public partial class DocumentTemplateRenderer : IDocumentTemplateRenderer
{
    // {{key}} tokens (same syntax as the email templates). Keys are [a-zA-Z0-9_].
    [GeneratedRegex(@"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")]
    private static partial Regex TokenRegex();

    public byte[] Render(string html, IReadOnlyDictionary<string, string?> values)
    {
        var doc = new HtmlDocument();
        doc.LoadHtml(html ?? string.Empty);
        // The editor emits a fragment (no <body>); DocumentNode is the common parent either way.
        var root = doc.DocumentNode;

        return Document.Create(container => container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(30); // tighter than the default so a one-page form stays one page
            page.DefaultTextStyle(x => x.FontSize(10).LineHeight(1.2f).FontColor(Colors.Black));

            // The document's own title/heading is authored in the template — we don't inject the doc-type name.
            page.Content().Column(col => RenderBlocks(col, root, values));

            page.Footer().AlignRight().DefaultTextStyle(x => x.FontSize(7).FontColor(Colors.Grey.Medium))
                .Text(t => { t.Span("Page "); t.CurrentPageNumber(); t.Span(" / "); t.TotalPages(); });
        })).GeneratePdf();
    }

    // A block-level walk: each child of `parent` becomes a Column item (paragraph, heading, list, rule…).
    private static void RenderBlocks(ColumnDescriptor col, HtmlNode parent, IReadOnlyDictionary<string, string?> values)
    {
        foreach (var node in parent.ChildNodes)
        {
            var name = node.Name.ToLowerInvariant();
            switch (name)
            {
                // A spacer — vertical breathing room between paragraphs.
                case "div" when node.Attributes.Contains("data-spacer"):
                    col.Item().Height(node.GetAttributeValue("data-h", 20) * 0.75f);
                    break;

                // A "cadre à remplir" — a clean bordered box for a longer handwritten answer.
                case "div" when node.Attributes.Contains("data-box"):
                    col.Item().PaddingVertical(2).Border(0.8f).BorderColor(Colors.Grey.Darken1)
                        .Height(node.GetAttributeValue("data-h", 70) * 0.75f);
                    break;

                case "p":
                case "div":
                    RenderParagraph(col, node, values);
                    break;

                case "h1": Heading(col, node, values, 15); break;
                case "h2": Heading(col, node, values, 13); break;
                case "h3": Heading(col, node, values, 11.5f); break;
                case "h4":
                case "h5":
                case "h6": Heading(col, node, values, 10.5f); break;

                case "ul": RenderList(col, node, values, ordered: false); break;
                case "ol": RenderList(col, node, values, ordered: true); break;

                // An inserted image (e.g. a letterhead / logo at the top). Read from uploads/content and draw it
                // fitted to the content width (capped in height so an oversized upload can't blow the layout).
                case "img":
                    var imgBytes = LoadContentImage(node.GetAttributeValue("src", ""));
                    if (imgBytes is not null)
                        col.Item().PaddingBottom(6).MaxHeight(180).AlignCenter().Image(imgBytes).FitArea();
                    break;

                case "hr":
                    col.Item().PaddingVertical(3).LineHorizontal(0.75f).LineColor(Colors.Grey.Lighten1);
                    break;

                case "br":
                    col.Item().Height(7);
                    break;

                case "#text":
                    var text = Decode(node.InnerText);
                    if (!string.IsNullOrWhiteSpace(text))
                        col.Item().PaddingBottom(3).Text(t => RenderInline(t, node, values, new InlineStyle()));
                    break;

                default:
                    // Unknown/container element (blockquote, table wrappers, TipTap wrappers…): recurse so its
                    // block children still render; if it has none, emit its text as a paragraph.
                    if (node.ChildNodes.Any(c => IsBlock(c.Name)))
                        RenderBlocks(col, node, values);
                    else if (HasVisibleContent(node, values))
                        col.Item().PaddingBottom(3).Element(e => RenderContent(e, node, values));
                    break;
            }
        }
    }

    private static void RenderParagraph(ColumnDescriptor col, HtmlNode node, IReadOnlyDictionary<string, string?> values)
    {
        if (HasVisibleContent(node, values))
            col.Item().PaddingBottom(3).Element(e => RenderContent(e, node, values));
        else
            col.Item().Height(7); // preserve an intentional blank line (signature spacing etc.)
    }

    private static void Heading(ColumnDescriptor col, HtmlNode node, IReadOnlyDictionary<string, string?> values, float size) =>
        col.Item().PaddingTop(3).PaddingBottom(2).Text(t =>
        {
            t.DefaultTextStyle(x => x.FontSize(size).Bold());
            ApplyAlign(t, node);
            RenderInline(t, node, values, new InlineStyle());
        });

    private static void RenderList(ColumnDescriptor col, HtmlNode listNode, IReadOnlyDictionary<string, string?> values, bool ordered)
    {
        var index = 1;
        foreach (var li in listNode.ChildNodes.Where(n => n.Name.Equals("li", StringComparison.OrdinalIgnoreCase)))
        {
            var prefix = ordered ? $"{index}." : "•";
            col.Item().PaddingBottom(2).Row(row =>
            {
                row.ConstantItem(16).AlignTop().Text(prefix);
                row.RelativeItem().Element(e => RenderContent(e, li, values));
            });
            index++;
        }
    }

    // Renders a block's inline content. A "label : ______" line (a single trailing fill-line after some text) is
    // laid out as a Row: the label on the left + an underline that GROWS to the right margin — so every fill line
    // ends at the same right edge and none wraps below its label. Anything else is normal inline text.
    private static void RenderContent(IContainer container, HtmlNode node, IReadOnlyDictionary<string, string?> values)
    {
        var alignNode = node;         // text-align lives on the outer block, before we unwrap into it
        var baseStyle = new InlineStyle();
        node = Unwrap(node, ref baseStyle); // descend list-item <p> wrappers AND a document-wide font <span>

        // A left/right split line: content before the ⇥ marker stays left, content after is pushed to the right
        // margin (e.g. "Fait à …, le [date]  ⇥  Signature : ____"). The left region wraps; the right hugs the margin.
        var kids = node.ChildNodes.ToList();
        var splitIdx = kids.FindIndex(c => c.Attributes is not null && c.Attributes.Contains("data-split"));
        if (splitIdx >= 0)
        {
            var left = kids.Take(splitIdx).ToList();
            var right = kids.Skip(splitIdx + 1).ToList();
            container.Row(row =>
            {
                row.RelativeItem().Text(t => RenderInlineChildren(t, left, values, baseStyle));
                row.AutoItem().PaddingLeft(12).Text(t => RenderInlineChildren(t, right, values, baseStyle));
            });
            return;
        }

        // A form line ("Label : ____", possibly several side by side like "Nom : ___  Date : ___"): render each
        // "label + growing underline" as an equal column so every blank sits ON the baseline and the underlines
        // align — instead of dropping below the text (the old inline fixed-width fills did).
        if (TryFieldSegments(node, out var segments))
        {
            RenderFieldLine(container, segments, values, baseStyle);
            return;
        }

        container.Text(t => { ApplyAlign(t, alignNode); RenderInline(t, node, values, baseStyle); });
    }

    // Lays out a form line as a Row of equal columns, each = a label (auto width) + an underline that grows to the
    // column's right edge. One fill → one full-width column (e.g. "Date : ______"); several → aligned side by side.
    private static void RenderFieldLine(IContainer container, List<List<HtmlNode>> segments, IReadOnlyDictionary<string, string?> values, InlineStyle baseStyle)
    {
        container.Row(row =>
        {
            for (var i = 0; i < segments.Count; i++)
            {
                var seg = segments[i];
                var cell = row.RelativeItem();
                if (i < segments.Count - 1) cell = cell.PaddingRight(14); // gap between adjacent fields
                cell.Row(inner =>
                {
                    inner.AutoItem().AlignBottom().Text(t => RenderInlineChildren(t, seg, values, baseStyle));
                    inner.RelativeItem().AlignBottom().PaddingLeft(6).PaddingBottom(2)
                        .LineHorizontal(0.7f).LineColor(Colors.Grey.Darken1);
                });
            }
        });
    }

    // Descends through a LONE wrapper so block-level detection (split marker / form line) sees the real content:
    //  • a single <p>/<div> — TipTap wraps a list item's content in a <p> (`<li><p>label : ___</p></li>`);
    //  • a single plain <span> — a font/size mark applied to the WHOLE block (e.g. a document-wide font) wraps all
    //    the content in one <span style="font-family:…">, which would otherwise hide the nested ⇥/fill markers.
    //    Its font is folded into `baseStyle` so the unwrapped content still renders in the chosen font.
    private static HtmlNode Unwrap(HtmlNode node, ref InlineStyle baseStyle)
    {
        while (true)
        {
            var significant = node.ChildNodes
                .Where(c => !(c.Name == "#text" && string.IsNullOrWhiteSpace(c.InnerText)))
                .ToList();
            if (significant.Count != 1) return node;
            var only = significant[0];
            var n = only.Name.ToLowerInvariant();

            if (n is "p" or "div" && !only.Attributes.Contains("data-box") && !only.Attributes.Contains("data-spacer"))
            {
                node = only;
                continue;
            }
            if (n == "span"
                && !only.Attributes.Contains("data-field") && !only.Attributes.Contains("data-fill")
                && !only.Attributes.Contains("data-checkbox") && !only.Attributes.Contains("data-split"))
            {
                baseStyle = ApplyInlineFont(only, baseStyle);
                node = only;
                continue;
            }
            return node;
        }
    }

    // Recognises a "form line": the block ENDS with a fill (ignoring trailing whitespace) and has no checkbox/box/
    // split. Partitions the inline content into one segment per fill (the label text/pills preceding each). A block
    // that ends with text (a blank in the MIDDLE of a flowing sentence) is NOT a form line → stays inline prose.
    private static bool TryFieldSegments(HtmlNode node, out List<List<HtmlNode>> segments)
    {
        segments = new List<List<HtmlNode>>();
        if (node.SelectSingleNode(".//*[@data-checkbox or @data-box or @data-split]") is not null) return false;

        var kids = node.ChildNodes.ToList();
        var lastSig = kids.LastOrDefault(c => !(c.Name == "#text" && string.IsNullOrWhiteSpace(c.InnerText)));
        if (lastSig?.Attributes is null || !lastSig.Attributes.Contains("data-fill")) return false;

        var current = new List<HtmlNode>();
        foreach (var c in kids)
        {
            if (c.Attributes is not null && c.Attributes.Contains("data-fill"))
            {
                segments.Add(current); // label before this fill = one field cell
                current = new List<HtmlNode>();
            }
            else current.Add(c); // trailing whitespace after the last fill stays in `current` and is discarded
        }
        return segments.Count > 0;
    }

    // Inline walk: emit a QuestPDF Span per text run, carrying the accumulated bold/italic/underline/strike style.
    // `skip` (optional) is a child node to omit — used by the label-line layout to render the label without its
    // trailing fill-line (which is drawn separately as a growing underline).
    private static void RenderInline(TextDescriptor text, HtmlNode node, IReadOnlyDictionary<string, string?> values, InlineStyle style)
        => RenderInlineChildren(text, node.ChildNodes, values, style);

    // Walks a sequence of inline nodes (a whole element's children, or one side of a left/right split).
    private static void RenderInlineChildren(TextDescriptor text, IEnumerable<HtmlNode> children, IReadOnlyDictionary<string, string?> values, InlineStyle style)
    {
        foreach (var child in children)
        {
            var name = child.Name.ToLowerInvariant();
            switch (name)
            {
                case "#text":
                    var raw = Decode(child.InnerText);
                    var resolved = Substitute(raw, values);
                    if (resolved.Length > 0)
                        StyleSpan(text.Span(resolved), style);
                    break;

                case "br":
                    text.Span("\n");
                    break;

                case "b":
                case "strong":
                    RenderInline(text, child, values, style with { Bold = true });
                    break;
                case "i":
                case "em":
                    RenderInline(text, child, values, style with { Italic = true });
                    break;
                case "u":
                    RenderInline(text, child, values, style with { Underline = true });
                    break;
                case "s":
                case "strike":
                case "del":
                    RenderInline(text, child, values, style with { Strike = true });
                    break;

                default:
                    // Form-builder elements (custom nodes) serialise to data-attributes on a span.
                    if (child.Attributes.Contains("data-field"))
                    {
                        // An auto-filled member field: emit its resolved value (blank if the member has no data).
                        var key = child.GetAttributeValue("data-field", "");
                        var fieldValue = values.TryGetValue(key, out var fv) ? fv ?? string.Empty : string.Empty;
                        if (fieldValue.Length > 0)
                            StyleSpan(text.Span(fieldValue), style);
                    }
                    else if (child.Attributes.Contains("data-fill"))
                    {
                        // A clean underline for a blank in the MIDDLE of flowing prose (a form line's trailing blank
                        // is handled by RenderFieldLine). Kept short in height so it sits just under the baseline
                        // rather than dropping a full line-height below it. No dotted line.
                        var w = child.GetAttributeValue("data-w", 200) * 0.75f;
                        text.Element(e => e.PaddingHorizontal(2).Height(3).Width(w)
                            .BorderBottom(0.8f).BorderColor(Colors.Grey.Darken2), TextInjectedElementAlignment.BelowBaseline);
                    }
                    else if (child.Attributes.Contains("data-checkbox"))
                    {
                        // A real checkbox drawn as an empty square (the PDF font has no ballot-box glyph).
                        text.Element(e => e.PaddingHorizontal(1).Width(11).Height(11)
                            .Border(0.9f).BorderColor(Colors.Black), TextInjectedElementAlignment.Middle);
                    }
                    else if (child.Attributes.Contains("data-split"))
                    {
                        // The left/right split marker is handled at the block level (RenderContent) — ignore inline.
                    }
                    else
                    {
                        // span, a, font, and any other inline wrapper: recurse, applying any font-family/size it sets.
                        RenderInline(text, child, values, ApplyInlineFont(child, style));
                    }
                    break;
            }
        }
    }

    // Applies the accumulated inline style to a QuestPDF span (bold/italic/underline/strike + font family/size).
    private static void StyleSpan(TextSpanDescriptor span, InlineStyle style)
    {
        if (style.Bold) span.Bold();
        if (style.Italic) span.Italic();
        if (style.Underline) span.Underline();
        if (style.Strike) span.Strikethrough();
        if (style.FontFamily is not null) span.FontFamily(style.FontFamily);
        if (style.FontSize is not null) span.FontSize(style.FontSize.Value);
    }

    // Reads font-family / font-size off a node's inline style (the editor writes them via TextStyle marks) and
    // folds them into the accumulated style. Unsupported units (em/rem/%) are ignored (blank stays blank).
    private static InlineStyle ApplyInlineFont(HtmlNode node, InlineStyle style)
    {
        // DECODE entities first: a spaced family name round-trips through the browser as the quoted form
        // font-family: "Times New Roman", which serialises as &quot;Times New Roman&quot; — without decoding,
        // the quotes stay as entities and the family name is never found (falls back to the default font).
        var css = Decode(node.GetAttributeValue("style", ""));
        if (string.IsNullOrEmpty(css)) return style;

        var fam = ReadStyleValue(css, "font-family");
        if (!string.IsNullOrWhiteSpace(fam))
            style = style with { FontFamily = fam.Split(',')[0].Trim().Trim('"', '\'') };

        var size = ReadStyleValue(css, "font-size");
        if (!string.IsNullOrWhiteSpace(size))
        {
            var pt = ParsePointSize(size!);
            if (pt.HasValue) style = style with { FontSize = pt };
        }
        return style;
    }

    // Extracts one declaration's value from an inline style string (exact property-name match, case-insensitive).
    private static string? ReadStyleValue(string css, string property)
    {
        foreach (var decl in css.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var idx = decl.IndexOf(':');
            if (idx <= 0) continue;
            if (decl[..idx].Trim().Equals(property, StringComparison.OrdinalIgnoreCase))
                return decl[(idx + 1)..].Trim();
        }
        return null;
    }

    // Parses a CSS font-size into PDF points: "12pt" → 12, "16px" → 12 (px×0.75), bare "12" → 12; em/rem/% → null.
    private static float? ParsePointSize(string size)
    {
        size = size.Trim().ToLowerInvariant();
        var mult = 1f;
        if (size.EndsWith("px")) { mult = 0.75f; size = size[..^2]; }
        else if (size.EndsWith("pt")) { size = size[..^2]; }
        else if (size.EndsWith("em") || size.EndsWith("rem") || size.EndsWith("%")) return null;
        return float.TryParse(size.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var n) && n > 0 && n < 200
            ? n * mult : null;
    }

    // Reads text-align from a block node's inline style. The editor emits "text-align: center" (WITH a space after
    // the colon), so strip whitespace before matching (a bare Contains("text-align:center") misses it).
    private static void ApplyAlign(TextDescriptor text, HtmlNode node)
    {
        var style = node.GetAttributeValue("style", "").ToLowerInvariant().Replace(" ", "");
        if (style.Contains("text-align:center")) text.AlignCenter();
        else if (style.Contains("text-align:right")) text.AlignRight();
        else if (style.Contains("text-align:justify")) text.Justify();
        else text.AlignLeft();
    }

    // Replace {{key}} with the resolved value (missing/null → empty string, i.e. a blank to fill by hand).
    private static string Substitute(string input, IReadOnlyDictionary<string, string?> values) =>
        TokenRegex().Replace(input, m =>
            values.TryGetValue(m.Groups[1].Value, out var v) ? v ?? string.Empty : string.Empty);

    private static string Decode(string s) => HtmlEntity.DeEntitize(s) ?? string.Empty;

    // Loads an inserted content image (from a /content/images/{file} src) off disk to embed in the PDF. Accepts
    // only a bare image filename under uploads/content (path-traversal guarded); returns null if invalid/missing.
    private static byte[]? LoadContentImage(string? src)
    {
        if (string.IsNullOrWhiteSpace(src)) return null;
        var idx = src.LastIndexOf('/');
        var fileName = System.IO.Path.GetFileName(idx >= 0 ? src[(idx + 1)..] : src);
        if (string.IsNullOrWhiteSpace(fileName)) return null;
        var ext = System.IO.Path.GetExtension(fileName).ToLowerInvariant();
        if (ext is not (".jpg" or ".jpeg" or ".png" or ".webp" or ".gif")) return null;
        var root = System.IO.Path.GetFullPath(System.IO.Path.Combine(Directory.GetCurrentDirectory(), "uploads", "content"));
        var path = System.IO.Path.GetFullPath(System.IO.Path.Combine(root, fileName));
        if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return null; // traversal guard
        return System.IO.File.Exists(path) ? System.IO.File.ReadAllBytes(path) : null;
    }

    private static bool IsBlock(string name) => name.ToLowerInvariant() is
        "p" or "div" or "h1" or "h2" or "h3" or "h4" or "h5" or "h6" or "ul" or "ol" or "hr" or "table";

    // Does this block have any text (after decoding) OR a placeholder that resolves to a non-empty value?
    // A paragraph that is only whitespace is treated as a blank line (preserved spacing), not skipped-with-content.
    private static bool HasVisibleContent(HtmlNode node, IReadOnlyDictionary<string, string?> values)
    {
        // A form element (fill line / checkbox / member field) counts as content even with no text.
        if (node.SelectSingleNode(".//*[@data-fill or @data-checkbox or @data-field or @data-box]") != null)
            return true;
        var text = Substitute(Decode(node.InnerText), values);
        return !string.IsNullOrWhiteSpace(text);
    }

    // Accumulated inline formatting as we descend the tree (font family/size come from span style="font-family/size").
    private readonly record struct InlineStyle(
        bool Bold = false, bool Italic = false, bool Underline = false, bool Strike = false,
        string? FontFamily = null, float? FontSize = null);
}
