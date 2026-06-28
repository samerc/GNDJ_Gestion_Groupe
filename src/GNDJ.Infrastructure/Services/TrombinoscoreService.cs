using GNDJ.Application.Common.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

public class TrombinoscoreService : ITrombinoscoreService
{
    public byte[] Generate(TrombinoscoreData data)
    {
        var totalMembers = data.Teams.Sum(t => t.Members.Count);
        var useA3 = totalMembers > 60;

        var pageSize = useA3 ? new PageSize(842, 1191) : PageSizes.A4; // A3 portrait
        var margin = useA3 ? 20f : 15f;
        var cellWidth = useA3 ? 70f : 56f;
        var photoSize = useA3 ? 55f : 44f;
        // Member photos are 3:4 portrait (camera capture is 600×800). Use a matching portrait box so the
        // photo FILLS it instead of being letterboxed inside a square (which made photos look smaller than
        // the grey placeholder). The placeholder uses the same box, so both render identically sized.
        var photoHeight = photoSize * 4f / 3f;
        var nameFontSize = useA3 ? 6f : 5f;
        var headerFontSize = useA3 ? 11f : 10f;

        var usableWidth = pageSize.Width - (margin * 2);
        var perRow = (int)(usableWidth / cellWidth);

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(pageSize);
                page.MarginHorizontal(margin);
                page.MarginVertical(12);
                page.DefaultTextStyle(x => x.FontSize(6));

                page.Header().Column(col =>
                {
                    col.Item().AlignCenter().Text("GROUPE NOTRE DAME - JAMHOUR")
                        .FontSize(headerFontSize).Bold();
                    col.Item().AlignCenter().PaddingTop(2).Text(data.UnitName)
                        .FontSize(headerFontSize - 1).SemiBold();
                    col.Item().AlignCenter().PaddingTop(1).Text($"Année scoute {data.ScoutYear}")
                        .FontSize(7);
                    col.Item().PaddingTop(4).LineHorizontal(0.5f);
                });

                page.Content().PaddingTop(5).Column(col =>
                {
                    col.Spacing(4);

                    foreach (var team in data.Teams)
                    {
                        // Team header — compact
                        col.Item().PaddingTop(2).Background(Colors.Grey.Lighten3)
                            .PaddingHorizontal(4).PaddingVertical(2)
                            .Text($"{team.TeamName} ({team.Members.Count})").FontSize(7).SemiBold();

                        // Render members in rows
                        var members = team.Members;
                        for (int i = 0; i < members.Count; i += perRow)
                        {
                            var rowMembers = members.Skip(i).Take(perRow).ToList();
                            col.Item().Row(row =>
                            {
                                foreach (var member in rowMembers)
                                {
                                    row.ConstantItem(cellWidth).PaddingVertical(1).Column(cell =>
                                    {
                                        if (data.IncludePhotos)
                                        {
                                            var photoRendered = false;
                                            if (!string.IsNullOrEmpty(member.PhotoPath))
                                            {
                                                var fullPath = Path.Combine(Directory.GetCurrentDirectory(), member.PhotoPath);
                                                if (File.Exists(fullPath))
                                                {
                                                    try
                                                    {
                                                        cell.Item().AlignCenter()
                                                            .Width(photoSize).Height(photoHeight)
                                                            .Image(fullPath).FitArea();
                                                        photoRendered = true;
                                                    }
                                                    catch { /* fallback to placeholder */ }
                                                }
                                            }

                                            if (!photoRendered)
                                            {
                                                cell.Item().AlignCenter()
                                                    .Width(photoSize).Height(photoHeight)
                                                    .Background(Colors.Grey.Lighten2)
                                                    .AlignCenter().AlignMiddle()
                                                    .Text(GetInitials(member.Name))
                                                    .FontSize(12).FontColor(Colors.Grey.Darken1);
                                            }
                                        }

                                        // Name — two lines max
                                        cell.Item().AlignCenter().PaddingTop(1)
                                            .Text(member.Name).FontSize(nameFontSize).LineHeight(1.1f);
                                    });
                                }
                                row.RelativeItem(); // fill remaining
                            });
                        }
                    }
                });

                page.Footer().Row(row =>
                {
                    row.RelativeItem().AlignLeft()
                        .Text($"Généré le {DateTime.Now:dd/MM/yyyy}").FontSize(6).Italic();
                    row.RelativeItem().AlignRight().DefaultTextStyle(x => x.FontSize(6))
                        .Text(t => { t.Span("Page "); t.CurrentPageNumber(); t.Span(" / "); t.TotalPages(); });
                });
            });
        });

        return document.GeneratePdf();
    }

    private static string GetInitials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 2) return $"{parts[0][0]}{parts[^1][0]}";
        if (parts.Length == 1) return parts[0][..1];
        return "?";
    }
}
