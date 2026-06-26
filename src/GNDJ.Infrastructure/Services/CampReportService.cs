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
            page.Content().Column(col =>
            {
                var units = data.Units.ToList();
                for (int u = 0; u < units.Count; u++)
                {
                    col.Item().Element(e => UnitBlock(e, data, units[u]));
                    if (u < units.Count - 1) col.Item().PageBreak();
                }
            });
            Foot(page);
        })).GeneratePdf();

    private static void UnitBlock(IContainer container, CampReportData data, CampReportUnit u) =>
        container.Column(col =>
        {
            col.Item().Text(u.UnitName).FontSize(18).Bold();
            col.Item().Text($"{data.CampName} — Année scoute {data.ScoutYear}").FontSize(9).Light();
            col.Item().Text($"{u.Members.Count} membres").FontSize(9).Light();

            foreach (var team in u.Members.GroupBy(m => m.TeamName ?? "Sans équipe").OrderBy(g => g.Key))
            {
                col.Item().PaddingTop(10).Background(Colors.Grey.Lighten3).Padding(4)
                    .Text($"{team.Key} ({team.Count()})").FontSize(11).SemiBold();
                col.Item().PaddingTop(2).Table(table =>
                {
                    table.ColumnsDefinition(d => { d.RelativeColumn(4); d.RelativeColumn(1); });
                    table.Header(h =>
                    {
                        h.Cell().Element(HeadCell).Text("Nom complet");
                        h.Cell().Element(HeadCell).AlignRight().Text("Famille");
                    });
                    var alt = false;
                    foreach (var m in team.OrderBy(x => x.Name))
                    {
                        var bg = alt ? Colors.Grey.Lighten4 : Colors.White; alt = !alt;
                        table.Cell().Background(bg).Padding(3).Text(m.Name);
                        table.Cell().Background(bg).Padding(3).AlignRight().Text(m.FamilleNumber?.ToString() ?? "—").SemiBold();
                    }
                });
            }
        });

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
            col.Item().Text($"{f.Members.Count} membres").FontSize(9).Light();

            col.Item().PaddingTop(8).Table(table =>
            {
                table.ColumnsDefinition(d => { d.RelativeColumn(0.5f); d.RelativeColumn(4f); d.RelativeColumn(2.2f); });
                table.Header(h =>
                {
                    h.Cell().Element(HeadCell).Text("#");
                    h.Cell().Element(HeadCell).Text("Nom complet");
                    h.Cell().Element(HeadCell).Text("Unité");
                });
                var i = 1; var alt = false;
                foreach (var m in f.Members)
                {
                    var leader = m.Role != null;
                    var bg = leader ? Colors.Blue.Lighten5 : (alt ? Colors.Grey.Lighten4 : Colors.White);
                    if (!leader) alt = !alt;
                    table.Cell().Background(bg).Padding(3).Text((i++).ToString());
                    table.Cell().Background(bg).Padding(3).Text(t =>
                    {
                        var span = t.Span(leader ? $"{m.Name} ({m.Role})" : m.Name);
                        if (leader) span.SemiBold();
                    });
                    table.Cell().Background(bg).Padding(3).Text(m.UnitName ?? "");
                }
            });
        });
}
