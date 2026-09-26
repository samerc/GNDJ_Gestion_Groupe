using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// Word (.docx) list of a posted passage's newcomers for one association, written with the Open XML SDK (already
// shipped with ClosedXML — no extra package). Title + subtitle, then per receiving unit a bold heading
// ("Passe à la Troupe 2 :") followed by one name per line.
public sealed class PassageNewcomersDocument : IPassageNewcomersDocument
{
    public byte[] Build(string title, string subtitle, IReadOnlyList<PassageNewcomersSection> sections)
    {
        using var ms = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
        {
            var main = doc.AddMainDocumentPart();
            var body = new Body();

            body.Append(Para(title, bold: true, sizeHalfPts: 32, spaceAfter: 60));
            body.Append(Para(subtitle, bold: false, sizeHalfPts: 22, spaceAfter: 360, color: "555555"));

            foreach (var s in sections)
            {
                body.Append(Para(s.Heading, bold: true, sizeHalfPts: 24, spaceAfter: 80, spaceBefore: 240));
                foreach (var name in s.Names)
                    body.Append(Para(name, bold: false, sizeHalfPts: 22, spaceAfter: 0));
            }

            // A4 page with 2 cm margins.
            body.Append(new SectionProperties(
                new PageSize { Width = 11906U, Height = 16838U },
                new PageMargin { Top = 1134, Bottom = 1134, Left = 1134U, Right = 1134U, Header = 709U, Footer = 709U, Gutter = 0U }));

            main.Document = new Document(body);
            main.Document.Save();
        }
        return ms.ToArray();
    }

    private static Paragraph Para(string text, bool bold, int sizeHalfPts, int spaceAfter, int spaceBefore = 0, string? color = null)
    {
        var runProps = new RunProperties(
            new RunFonts { Ascii = "Calibri", HighAnsi = "Calibri", ComplexScript = "Calibri" },
            new FontSize { Val = sizeHalfPts.ToString() });
        if (bold) runProps.Append(new Bold());
        if (color is not null) runProps.Append(new Color { Val = color });

        return new Paragraph(
            new ParagraphProperties(new SpacingBetweenLines { After = spaceAfter.ToString(), Before = spaceBefore.ToString() }),
            new Run(runProps, new Text(text) { Space = SpaceProcessingModeValues.Preserve }));
    }
}
