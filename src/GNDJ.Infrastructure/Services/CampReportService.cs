using GNDJ.Application.Common.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

public class CampReportService : ICampReportService
{
    public byte[] Famille(CampReportData data, int familleNumber)
    {
        var fam = data.Familles.FirstOrDefault(f => f.Number == familleNumber);
        return Document.Create(c => c.Page(page =>
        {
            Setup(page);
            page.Content().Element(e => { if (fam != null) FamilleBlock(e, data, fam); });
            Foot(page);
        })).GeneratePdf();
    }

    public byte[] AllFamilles(CampReportData data) =>
        Document.Create(c => c.Page(page =>
        {
            Setup(page);
            page.Content().Column(col =>
            {
                var list = data.Familles.ToList();
                for (int i = 0; i < list.Count; i++)
                {
                    col.Item().Element(e => FamilleBlock(e, data, list[i]));
                    if (i < list.Count - 1) col.Item().PageBreak();
                }
            });
            Foot(page);
        })).GeneratePdf();

    public byte[] UnitList(CampReportData data) =>
        Document.Create(c => c.Page(page =>
        {
            Setup(page);
            page.Content().PaddingTop(6).Column(col =>
            {
                col.Item().Text("Liste par unité — n° de famille").FontSize(15).Bold();
                col.Item().Text($"{data.CampName} — Année scoute {data.ScoutYear}").FontSize(9).Light();
                foreach (var u in data.Units)
                {
                    col.Item().PaddingTop(10).Background(Colors.Grey.Lighten3).Padding(4)
                        .Text($"{u.UnitName} ({u.Members.Count})").FontSize(11).SemiBold();
                    col.Item().PaddingTop(2).Table(table =>
                    {
                        table.ColumnsDefinition(d => { d.RelativeColumn(3); d.RelativeColumn(1.5f); d.RelativeColumn(0.8f); d.RelativeColumn(1.2f); });
                        table.Header(h =>
                        {
                            h.Cell().Element(HeadCell).Text("Nom complet");
                            h.Cell().Element(HeadCell).Text("Branche");
                            h.Cell().Element(HeadCell).AlignRight().Text("Note");
                            h.Cell().Element(HeadCell).AlignRight().Text("Famille");
                        });
                        var alt = false;
                        foreach (var m in u.Members.OrderBy(x => x.Name))
                        {
                            var bg = alt ? Colors.Grey.Lighten4 : Colors.White; alt = !alt;
                            table.Cell().Background(bg).Padding(3).Text(m.Name);
                            table.Cell().Background(bg).Padding(3).Text(m.Branche ?? "");
                            table.Cell().Background(bg).Padding(3).AlignRight().Text(m.Note?.ToString() ?? "");
                            table.Cell().Background(bg).Padding(3).AlignRight().Text(m.FamilleNumber?.ToString() ?? "—").SemiBold();
                        }
                    });
                }
            });
            Foot(page);
        })).GeneratePdf();

    // ── shared ──
    private static void Setup(PageDescriptor page)
    {
        page.Size(PageSizes.A4);
        page.Margin(28);
        page.DefaultTextStyle(x => x.FontSize(9));
    }

    private static void Foot(PageDescriptor page) =>
        page.Footer().Row(row =>
        {
            row.RelativeItem().Text($"Généré le {DateTime.Now:dd/MM/yyyy}").FontSize(7).Italic();
            row.RelativeItem().AlignRight().DefaultTextStyle(x => x.FontSize(7))
                .Text(t => { t.Span("Page "); t.CurrentPageNumber(); t.Span("/"); t.TotalPages(); });
        });

    private static IContainer HeadCell(IContainer c) =>
        c.Background(Colors.Grey.Lighten3).Padding(3).DefaultTextStyle(x => x.FontSize(8).SemiBold());

    private static void FamilleBlock(IContainer container, CampReportData data, CampReportFamille f) =>
        container.Column(col =>
        {
            col.Item().Text($"Famille {f.Number}").FontSize(18).Bold();
            col.Item().Text($"{data.CampName} — Année scoute {data.ScoutYear}").FontSize(9).Light();
            col.Item().PaddingTop(4).Row(r =>
            {
                r.RelativeItem().Text(t => { t.Span("Père : ").SemiBold(); t.Span(f.PereName ?? "—"); });
                r.RelativeItem().Text(t => { t.Span("Mère : ").SemiBold(); t.Span(f.MereName ?? "—"); });
            });
            col.Item().Text($"{f.Members.Count} membres").FontSize(9).Light();

            col.Item().PaddingTop(8).Table(table =>
            {
                table.ColumnsDefinition(d => { d.RelativeColumn(0.5f); d.RelativeColumn(3); d.RelativeColumn(1.5f); d.RelativeColumn(2.2f); d.RelativeColumn(0.8f); });
                table.Header(h =>
                {
                    h.Cell().Element(HeadCell).Text("#");
                    h.Cell().Element(HeadCell).Text("Nom complet");
                    h.Cell().Element(HeadCell).Text("Branche");
                    h.Cell().Element(HeadCell).Text("Unité");
                    h.Cell().Element(HeadCell).AlignRight().Text("Note");
                });
                var i = 1; var alt = false;
                foreach (var m in f.Members)
                {
                    var bg = alt ? Colors.Grey.Lighten4 : Colors.White; alt = !alt;
                    table.Cell().Background(bg).Padding(3).Text((i++).ToString());
                    table.Cell().Background(bg).Padding(3).Text($"{m.Name} {(m.Gender == "Féminin" ? "♀" : m.Gender == "Masculin" ? "♂" : "")}");
                    table.Cell().Background(bg).Padding(3).Text(m.Branche ?? "");
                    table.Cell().Background(bg).Padding(3).Text(m.UnitName ?? "");
                    table.Cell().Background(bg).Padding(3).AlignRight().Text(m.Note?.ToString() ?? "");
                }
            });
        });
}
