namespace GNDJ.Application.Common.Interfaces;

// Renders an in-app document template (TipTap/HTML authored by the CG) to a PDF, substituting {{champs}}
// with a member's resolved field values. Implemented with HtmlAgilityPack (parse) + QuestPDF (layout) in
// Infrastructure. `values` maps placeholder key → resolved text (a missing/blank value renders empty, leaving
// a blank the member completes by hand). The document's title/heading is authored in the template itself.
public interface IDocumentTemplateRenderer
{
    byte[] Render(string html, IReadOnlyDictionary<string, string?> values);
}
