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

    public byte[] Render(string html, IReadOnlyDictionary<string, string?> values, string? title = null)
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

            page.Content().Column(col =>
            {
                if (!string.IsNullOrWhiteSpace(title))
                    col.Item().PaddingBottom(6).Text(title).FontSize(15).Bold();
                RenderBlocks(col, root, values);
            });

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
        if (IsLabelLine(node, out var fill))
        {
            container.Row(row =>
            {
                row.AutoItem().AlignBottom().Text(t => RenderInline(t, node, values, new InlineStyle(), skip: fill));
                row.RelativeItem().AlignBottom().PaddingLeft(6).PaddingBottom(2)
                    .LineHorizontal(0.7f).LineColor(Colors.Grey.Darken1);
            });
        }
        else
        {
            container.Text(t => { ApplyAlign(t, node); RenderInline(t, node, values, new InlineStyle()); });
        }
    }

    // True when the block is "some label text/pills, then ONE fill-line as the last element, and no checkbox/box"
    // — the pattern that should become a right-aligned growing underline.
    private static bool IsLabelLine(HtmlNode node, out HtmlNode? fill)
    {
        fill = null;
        var fills = node.ChildNodes.Where(c => c.Attributes is not null && c.Attributes.Contains("data-fill")).ToList();
        if (fills.Count != 1) return false; // 0 = no line; ≥2 = multiple fields on the line → keep inline
        if (node.SelectSingleNode(".//*[@data-checkbox or @data-box]") is not null) return false;
        var last = node.ChildNodes.LastOrDefault(c => !(c.Name == "#text" && string.IsNullOrWhiteSpace(c.InnerText)));
        if (last is null || last.Attributes is null || !last.Attributes.Contains("data-fill")) return false;
        fill = fills[0];
        return true;
    }

    // Inline walk: emit a QuestPDF Span per text run, carrying the accumulated bold/italic/underline/strike style.
    // `skip` (optional) is a child node to omit — used by the label-line layout to render the label without its
    // trailing fill-line (which is drawn separately as a growing underline).
    private static void RenderInline(TextDescriptor text, HtmlNode node, IReadOnlyDictionary<string, string?> values, InlineStyle style, HtmlNode? skip = null)
    {
        foreach (var child in node.ChildNodes)
        {
            if (child == skip) continue;
            var name = child.Name.ToLowerInvariant();
            switch (name)
            {
                case "#text":
                    var raw = Decode(child.InnerText);
                    var resolved = Substitute(raw, values);
                    if (resolved.Length > 0)
                    {
                        var span = text.Span(resolved);
                        if (style.Bold) span = span.Bold();
                        if (style.Italic) span = span.Italic();
                        if (style.Underline) span = span.Underline();
                        if (style.Strike) span = span.Strikethrough();
                    }
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
                        {
                            var span = text.Span(fieldValue);
                            if (style.Bold) span = span.Bold();
                            if (style.Italic) span = span.Italic();
                            if (style.Underline) span = span.Underline();
                            if (style.Strike) span = span.Strikethrough();
                        }
                    }
                    else if (child.Attributes.Contains("data-fill"))
                    {
                        // A clean underline the member writes on (width in px → points). No dotted line.
                        var w = child.GetAttributeValue("data-w", 200) * 0.75f;
                        text.Element(e => e.PaddingHorizontal(2).Height(11).Width(w)
                            .BorderBottom(0.8f).BorderColor(Colors.Grey.Darken2), TextInjectedElementAlignment.BelowBaseline);
                    }
                    else if (child.Attributes.Contains("data-checkbox"))
                    {
                        // A real checkbox drawn as an empty square (the PDF font has no ballot-box glyph).
                        text.Element(e => e.PaddingHorizontal(1).Width(11).Height(11)
                            .Border(0.9f).BorderColor(Colors.Black), TextInjectedElementAlignment.Middle);
                    }
                    else
                    {
                        // span, a, font, and any other inline wrapper: recurse, keeping the current style.
                        RenderInline(text, child, values, style);
                    }
                    break;
            }
        }
    }

    // Reads text-align from a block node's inline style (the editor writes style="text-align:center").
    private static void ApplyAlign(TextDescriptor text, HtmlNode node)
    {
        var style = node.GetAttributeValue("style", "").ToLowerInvariant();
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

    // Accumulated inline formatting as we descend the tree.
    private readonly record struct InlineStyle(bool Bold = false, bool Italic = false, bool Underline = false, bool Strike = false);
}
