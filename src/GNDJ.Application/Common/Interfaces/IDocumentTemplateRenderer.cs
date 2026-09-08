namespace GNDJ.Application.Common.Interfaces;

// Renders an in-app document template (TipTap/HTML authored by the CG) to a PDF, substituting {{champs}}
// with a member's resolved field values. Implemented with HtmlAgilityPack (parse) + QuestPDF (layout) in
// Infrastructure. `title` becomes the PDF file title / a header; `values` maps placeholder key → resolved
// text (a missing/blank value renders empty, leaving a blank the member completes by hand).
public interface IDocumentTemplateRenderer
{
    byte[] Render(string html, IReadOnlyDictionary<string, string?> values, string? title = null);
}
