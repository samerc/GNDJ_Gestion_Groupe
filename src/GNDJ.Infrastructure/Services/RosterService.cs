using GNDJ.Application.Common.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

public class RosterService : IRosterService
{
    private static readonly Dictionary<string, (string Label, float Width)> ColumnDefs = new()
    {
        ["name"] = ("Nom", 3),
        ["cardNumber"] = ("N\u00b0 carte", 1.2f),
        ["gender"] = ("Genre", 1),
        ["dateOfBirth"] = ("Date naiss.", 1.5f),
        ["age"] = ("\u00c2ge", 0.7f),
        ["bloodType"] = ("Sang", 0.7f),
        ["nationality"] = ("Nationalit\u00e9", 1.5f),
        ["school"] = ("\u00c9cole", 2),
        ["classe"] = ("Classe", 1),
        ["section"] = ("Section", 0.8f),
        ["phone"] = ("T\u00e9l\u00e9phone", 1.8f),
        ["email"] = ("Email", 2.5f),
        ["role"] = ("Fonction", 1.5f),
        ["team"] = ("\u00c9quipe", 1.5f),
    };

    public byte[] Generate(RosterData data)
    {
        var columns = data.Columns.Where(c => ColumnDefs.ContainsKey(c)).ToList();
        if (columns.Count == 0) columns = ["name", "cardNumber", "age", "phone", "role"];

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(20);
                page.DefaultTextStyle(x => x.FontSize(7));

                page.Header().Column(col =>
                {
                    col.Item().Text(data.Title).FontSize(12).Bold();
                    col.Item().Text($"Année scoute {data.ScoutYear}").FontSize(8);
                    col.Item().PaddingTop(4).LineHorizontal(0.5f);
                });

                page.Content().PaddingTop(8).Column(content =>
                {
                    foreach (var team in data.Teams)
                    {
                        if (data.Teams.Count > 1)
                        {
                            content.Item().PaddingTop(6).Background(Colors.Grey.Lighten3)
                                .PaddingHorizontal(4).PaddingVertical(2)
                                .Text($"{team.TeamName} ({team.Members.Count})").FontSize(8).SemiBold();
                        }

                        content.Item().PaddingTop(2).Table(table =>
                        {
                            table.ColumnsDefinition(def =>
                            {
                                foreach (var col in columns)
                                    def.RelativeColumn(ColumnDefs[col].Width);
                            });

                            table.Header(header =>
                            {
                                foreach (var col in columns)
                                {
                                    header.Cell().Background(Colors.Grey.Lighten3)
                                        .Padding(3).Text(ColumnDefs[col].Label)
                                        .FontSize(6.5f).SemiBold();
                                }
                            });

                            var isAlt = false;
                            foreach (var m in team.Members)
                            {
                                var bg = isAlt ? Colors.Grey.Lighten4 : Colors.White;
                                foreach (var col in columns)
                                {
                                    var val = GetValue(m, col);
                                    table.Cell().Background(bg).Padding(3).Text(val).FontSize(6.5f);
                                }
                                isAlt = !isAlt;
                            }
                        });
                    }
                });

                page.Footer().Row(row =>
                {
                    row.RelativeItem().Text($"G\u00e9n\u00e9r\u00e9 le {DateTime.Now:dd/MM/yyyy}").FontSize(6).Italic();
                    row.RelativeItem().AlignRight().DefaultTextStyle(x => x.FontSize(6))
                        .Text(t => { t.Span("Page "); t.CurrentPageNumber(); t.Span("/"); t.TotalPages(); });
                });
            });
        });

        return document.GeneratePdf();
    }

    private static string GetValue(RosterMemberData m, string col) => col switch
    {
        "name" => m.Name,
        "cardNumber" => m.CardNumber ?? "",
        "gender" => m.Gender ?? "",
        "dateOfBirth" => m.DateOfBirth ?? "",
        "age" => m.Age?.ToString() ?? "",
        "bloodType" => m.BloodType ?? "",
        "nationality" => m.Nationality ?? "",
        "school" => m.School ?? "",
        "classe" => m.Classe ?? "",
        "section" => m.Section ?? "",
        "phone" => m.Phone ?? "",
        "email" => m.Email ?? "",
        "role" => m.RoleName ?? "",
        "team" => m.TeamName ?? "",
        _ => m.CustomFields.FirstOrDefault(cf => cf.Name == col)?.Value ?? ""
    };
}
