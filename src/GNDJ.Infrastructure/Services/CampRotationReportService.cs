using GNDJ.Application.Common.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

// Grand jeu printouts (QuestPDF): the famille passports (portrait, one page per famille) and the game score
// sheets (landscape, one page per game) used to score on paper and type the scores in afterwards.
public class CampRotationReportService : ICampRotationReportService
{
    private static readonly string[] Days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    private static readonly string[] Months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    private static string Day(DateOnly d) => $"{Days[(int)d.DayOfWeek]} {d.Day} {Months[d.Month - 1]}";
    private static string Hours(TimeOnly s, TimeOnly e) => $"{s:HH\\hmm}–{e:HH\\hmm}";

    // GET /camps/{id}/passports/pdf: one passport per famille listing its étapes (time, game, place, opponent) with
    // blank boxes for the étapiste. useBackup = the camp's Plan B is on → backup places are shown.
    public byte[] Passports(string campName, bool useBackup, IReadOnlyList<CampPassportFamille> familles) =>
        Document.Create(c => c.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(24);
            page.DefaultTextStyle(x => x.FontSize(9));
            page.Content().Column(col =>
            {
                for (var i = 0; i < familles.Count; i++)
                {
                    var f = familles[i];
                    col.Item().Element(e => Passport(e, campName, useBackup, f));
                    // Page break BETWEEN familles only (no blank trailing page).
                    if (i < familles.Count - 1) col.Item().PageBreak();
                }
            });
        })).GeneratePdf();

    private static void Passport(IContainer container, string campName, bool useBackup, CampPassportFamille f) =>
        container.Column(col =>
        {
            col.Item().Row(r =>
            {
                r.RelativeItem().Column(h =>
                {
                    h.Item().Text($"Famille {f.Number}{(string.IsNullOrWhiteSpace(f.Name) ? "" : " — " + f.Name)}").FontSize(18).Bold();
                    h.Item().Text(campName + (f.SuperFamille is null ? "" : $" · {f.SuperFamille}")).FontSize(9).Light();
                });
                r.ConstantItem(170).AlignRight().Column(h =>
                {
                    if (f.PereName is not null) h.Item().AlignRight().Text($"Père : {f.PereName}").SemiBold();
                    if (f.MereName is not null) h.Item().AlignRight().Text($"Mère : {f.MereName}").SemiBold();
                });
            });
            if (!string.IsNullOrWhiteSpace(f.Description))
                col.Item().PaddingTop(4).Text(f.Description).Italic().FontSize(8.5f);

            if (f.Members.Count > 0)
            {
                col.Item().PaddingTop(6).Text($"Membres ({f.Members.Count})").SemiBold();
                col.Item().PaddingTop(2).Table(t =>
                {
                    t.ColumnsDefinition(d => { d.RelativeColumn(); d.RelativeColumn(); d.RelativeColumn(); });
                    foreach (var m in f.Members) t.Cell().PaddingVertical(1).Text(m).FontSize(8);
                });
            }

            foreach (var day in f.Steps.GroupBy(s => s.Date).OrderBy(g => g.Key))
            {
                col.Item().PaddingTop(8).Background(Colors.Grey.Lighten3).Padding(3).Text(Day(day.Key)).SemiBold();
                col.Item().Table(t =>
                {
                    t.ColumnsDefinition(d =>
                    {
                        d.ConstantColumn(74); d.RelativeColumn(2.4f); d.RelativeColumn(2.6f); d.ConstantColumn(38);
                        d.ConstantColumn(38); d.ConstantColumn(42); d.RelativeColumn(1.4f);
                    });
                    t.Header(h =>
                    {
                        foreach (var label in new[] { "Heure", "Jeu", useBackup ? "Lieu (plan B)" : "Lieu", "Contre", "Note /5", "Énigme", "Signature" })
                            h.Cell().Element(Head).Text(label);
                    });
                    foreach (var s in day.OrderBy(x => x.Slot))
                    {
                        t.Cell().Element(Cell).Text(Hours(s.Start, s.End));
                        t.Cell().Element(Cell).Text($"{s.GameNumber}. {s.GameName ?? ""}");
                        t.Cell().Element(Cell).Text(s.Location ?? "—");
                        t.Cell().Element(Cell).AlignCenter().Text($"F{s.Opponent}").SemiBold();
                        t.Cell().Element(Cell).Text("");
                        t.Cell().Element(Cell).AlignCenter().Text("oui · non").FontSize(7).FontColor(Colors.Grey.Darken1);
                        t.Cell().Element(Cell).Text("");
                    }
                });
            }
        });

    // GET /camps/{id}/score-sheets/pdf: one landscape sheet per game, one line per match of the rotation, filled on paper
    // and typed in afterwards (Pointage tab). The rules box mirrors CampScoring.
    public byte[] ScoreSheets(string campName, IReadOnlyList<CampScoreSheetGame> games) =>
        Document.Create(c => c.Page(page =>
        {
            page.Size(PageSizes.A4.Landscape());
            page.Margin(20);
            page.DefaultTextStyle(x => x.FontSize(8.5f));
            page.Content().Column(col =>
            {
                for (var i = 0; i < games.Count; i++)
                {
                    var g = games[i];
                    col.Item().Element(e => ScoreSheet(e, campName, g));
                    if (i < games.Count - 1) col.Item().PageBreak();
                }
            });
        })).GeneratePdf();

    private static void ScoreSheet(IContainer container, string campName, CampScoreSheetGame g) =>
        container.Column(col =>
        {
            col.Item().Row(r =>
            {
                r.RelativeItem().Column(h =>
                {
                    h.Item().Text($"Jeu {g.Number}{(string.IsNullOrWhiteSpace(g.Name) ? "" : " — " + g.Name)}").FontSize(16).Bold();
                    h.Item().Text($"{campName} · Lieu : {g.Location ?? "—"}{(g.BackupLocation is null ? "" : $" (plan B : {g.BackupLocation})")}{(g.BackupGameName is null ? "" : $" · jeu de repli : {g.BackupGameName}")}").FontSize(8.5f).Light();
                    if (g.Etapistes.Count > 0) h.Item().Text("Étapistes : " + string.Join(", ", g.Etapistes)).FontSize(8.5f);
                });
                r.ConstantItem(300).Border(0.5f).BorderColor(Colors.Grey.Medium).Padding(4).DefaultTextStyle(x => x.FontSize(7))
                    .Column(rules =>
                    {
                        rules.Item().Text("Manche : 50 pts (50–0 ou 25–25). Esprit : 5 pts à partager.").SemiBold();
                        rules.Item().Text("Retard A (3–7 min) : manche 1 donnée à la famille à l'heure, seule la manche 2 se joue.");
                        rules.Item().Text("Retard B (7–10 min) : aucune manche, 100 pts à l'autre famille.");
                        rules.Item().Text("Énigme : au gagnant ; égalité → 1ère famille arrivée au complet ; jamais en retard B.");
                    });
            });

            // One line per match: famille A's boxes on the left, famille B's on the right.
            col.Item().PaddingTop(6).Table(t =>
            {
                t.ColumnsDefinition(d =>
                {
                    d.ConstantColumn(22); d.ConstantColumn(62);
                    for (var side = 0; side < 2; side++)
                    {
                        d.ConstantColumn(30); d.ConstantColumn(58); d.RelativeColumn(); d.RelativeColumn(); d.ConstantColumn(36); d.ConstantColumn(40);
                    }
                    d.RelativeColumn(1.3f);
                });
                t.Header(h =>
                {
                    h.Cell().RowSpan(2).Element(Head).Text("Ét.");
                    h.Cell().RowSpan(2).Element(Head).Text("Heure");
                    h.Cell().ColumnSpan(6).Element(Head).AlignCenter().Text("Famille A");
                    h.Cell().ColumnSpan(6).Element(Head).AlignCenter().Text("Famille B");
                    h.Cell().RowSpan(2).Element(Head).Text("Signatures");
                    for (var side = 0; side < 2; side++)
                        foreach (var label in new[] { "N°", "Retard", "Manche 1", "Manche 2", "Esprit", "Énigme" })
                            h.Cell().Element(Head).Text(label);
                });
                DateOnly? lastDay = null;
                foreach (var row in g.Rows.OrderBy(r => r.Slot))
                {
                    if (lastDay != row.Date)
                    {
                        // Day separator spans all 15 columns (2 fixed + 6 per famille × 2 + signatures).
                        t.Cell().ColumnSpan(15).Background(Colors.Grey.Lighten4).Padding(2).Text(Day(row.Date)).SemiBold();
                        lastDay = row.Date;
                    }
                    t.Cell().Element(Cell).Text(row.Slot.ToString());
                    t.Cell().Element(Cell).Text(Hours(row.Start, row.End));
                    foreach (var fam in new[] { row.FamilleA, row.FamilleB })
                    {
                        t.Cell().Element(Cell).AlignCenter().Text($"F{fam}").SemiBold();
                        t.Cell().Element(Cell).Text("0 · A · B").FontColor(Colors.Grey.Darken1);
                        t.Cell().Element(Cell).Text("");
                        t.Cell().Element(Cell).Text("");
                        t.Cell().Element(Cell).AlignRight().Text("/5").FontColor(Colors.Grey.Darken1);
                        t.Cell().Element(Cell).AlignCenter().Text("oui · non").FontSize(7).FontColor(Colors.Grey.Darken1);
                    }
                    t.Cell().Element(Cell).Text("");
                }
            });
            col.Item().PaddingTop(4).Text("Retard : 0 = à l'heure (0–3 min), A = 3–7 min, B = 7–10 min. Manche : points gagnés par la famille (50, 25 ou 0). Esprit : les deux familles totalisent 5.")
                .FontSize(7).Italic();
        });

    private static IContainer Head(IContainer c) =>
        c.Background(Colors.Grey.Lighten3).Border(0.5f).BorderColor(Colors.Grey.Medium).Padding(3).DefaultTextStyle(x => x.FontSize(7.5f).SemiBold());
    private static IContainer Cell(IContainer c) =>
        c.Border(0.5f).BorderColor(Colors.Grey.Lighten1).PaddingVertical(3.5f).PaddingHorizontal(3);
}
