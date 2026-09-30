using GNDJ.Application.Common.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

// Generates the Camp BP roster PDFs (QuestPDF, A4). Three layouts share the same page setup/footer:
// a single famille sheet, all familles (one per page via PageBreak), and a unit list (one unit per
// page in two columns, members grouped by team, showing each member's assigned famille number). Leaders (Père/Mère,
// Role != null) are tinted blue and kept out of the zebra-striping alternation.
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

    // One unit = one page: title, then the members split into TWO columns of about the same height. Teams stay in
    // order; a team cut at the middle continues at the top of the second column (header "… (suite)"). Rows are
    // compact, and ScaleToFit shrinks the page if a very big unit still wouldn't fit — so a unit never spills over.
    private static void UnitBlock(IContainer container, CampReportData data, CampReportUnit u) =>
        container.ScaleToFit().Column(col =>
        {
            col.Item().Row(r =>
            {
                r.RelativeItem().Text(u.UnitName).FontSize(18).Bold();
                r.AutoItem().AlignBottom().Text($"{u.Members.Count} membres").FontSize(9).Light();
            });
            col.Item().Text($"{data.CampName} — Année scoute {data.ScoutYear}").FontSize(9).Light();

            // Flatten into lines (team header or member), then cut at the middle of the total height.
            var lines = new List<(string Team, CampReportMember? Member)>();
            foreach (var team in u.Members.GroupBy(m => m.TeamName ?? "Sans équipe").OrderBy(g => g.Key))
            {
                lines.Add((team.Key, null));
                foreach (var m in team.OrderBy(x => x.Name)) lines.Add((team.Key, m));
            }
            const double headerWeight = 1.4;
            double Weight((string, CampReportMember?) l) => l.Item2 == null ? headerWeight : 1;
            var half = lines.Sum(Weight) / 2;
            double acc = 0; var cut = lines.Count;
            for (var i = 0; i < lines.Count; i++)
            {
                if (acc + Weight(lines[i]) / 2 > half) { cut = i; break; }
                acc += Weight(lines[i]);
            }
            // Never leave a team header alone at the bottom of the first column.
            if (cut > 0 && cut < lines.Count && lines[cut - 1].Member == null) cut--;
            var left = lines.Take(cut).ToList();
            var right = lines.Skip(cut).ToList();
            if (right.Count > 0 && right[0].Member != null) right.Insert(0, (right[0].Team + " (suite)", null));

            col.Item().PaddingTop(8).Row(r =>
            {
                r.RelativeItem().Element(e => UnitColumn(e, left, u));
                r.ConstantItem(14);
                r.RelativeItem().Element(e => UnitColumn(e, right, u));
            });
        });

    private static void UnitColumn(IContainer container, List<(string Team, CampReportMember? Member)> lines, CampReportUnit u) =>
        container.Column(col =>
        {
            var alt = false;
            var first = true;
            foreach (var (team, m) in lines)
            {
                if (m == null)
                {
                    var count = u.Members.Count(x => (x.TeamName ?? "Sans équipe") == team);
                    col.Item().PaddingTop(first ? 0 : 5).Background(Colors.Grey.Lighten3).PaddingVertical(2).PaddingHorizontal(4)
                        .Row(r =>
                        {
                            r.RelativeItem().Text(team.EndsWith(" (suite)") ? team : $"{team} ({count})").FontSize(10).SemiBold();
                            r.AutoItem().Text("Famille").FontSize(7).Light();
                        });
                    alt = false;
                }
                else
                {
                    var bg = alt ? Colors.Grey.Lighten4 : Colors.White; alt = !alt;
                    col.Item().Background(bg).PaddingVertical(1.5f).PaddingHorizontal(4).Row(r =>
                    {
                        // Père / Mère: role after the name.
                        r.RelativeItem().Text(t =>
                        {
                            t.Span(m.Name);
                            if (m.Role != null) t.Span($"  ({m.Role})").FontSize(8).Italic().FontColor(Colors.Blue.Darken2);
                        });
                        r.ConstantItem(30).AlignRight().Text(m.FamilleNumber?.ToString() ?? "—").SemiBold();
                    });
                }
                first = false;
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
