using GNDJ.Application.Common.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

// Generates a unit trombinoscope (photo wall) PDF (QuestPDF): a grid of member photo cells grouped
// under team headers. Page size auto-scales — A3 for large units (>60 members) so cells stay legible,
// A4 otherwise — and all dimensions (cell/photo/font) derive from that choice. Members without a
// usable photo get an initials placeholder sized identically to a real photo.
public class TrombinoscoreService : ITrombinoscoreService
{
    public byte[] Generate(TrombinoscoreData data)
    {
        // Larger units overflow A4 with readable photos, so switch to the bigger A3 sheet past a threshold.
        var totalMembers = data.Teams.Sum(t => t.Members.Count);
        var useA3 = totalMembers > 60;

        var pageSize = useA3 ? new PageSize(842, 1191) : PageSizes.A4; // A3 portrait
        var margin = useA3 ? 20f : 15f;
        var headerFontSize = useA3 ? 11f : 10f;

        var usableWidth = pageSize.Width - (margin * 2);

        // ── Fit everything on ONE page ──────────────────────────────────────────────
        // Rather than let QuestPDF paginate (which spilled big units onto a 2nd/3rd sheet), we shrink the
        // photo cells until the whole grid fits the single page's usable height. We start from the ideal
        // cell size and step down; the first size whose estimated layout height fits wins (= biggest legible
        // cell that still fits). If even the smallest doesn't fit (very large unit), we keep the smallest.
        const float teamHeaderH = 16f;   // team header row (~font 7 + paddings), rounded up for safety
        const float rowSpacing = 4f;     // col.Spacing(4) between items
        // Vertical budget: page height minus top (page margin + header block) and bottom (footer + margin).
        var reservedTop = useA3 ? 74f : 62f;
        var reservedBottom = 26f;
        var availHeight = pageSize.Height - reservedTop - reservedBottom;

        var maxCell = useA3 ? 70f : 56f;
        const float minCell = 24f;

        // Estimate total content height for a given cell width (drives columns, photo size, name font).
        // Deliberately a touch pessimistic (long scout names wrap to 2 lines) so we never spill to a 2nd page.
        float EstimateHeight(float cw)
        {
            var cols = Math.Max(1, (int)(usableWidth / cw));
            var photoS = cw * 0.786f;
            var photoH = photoS * 4f / 3f;
            var nameF = Math.Clamp(cw * 5f / 56f, 4f, 7f);
            var cellH = photoH + (nameF * 2.6f) + 5f; // photo + up to ~2 name lines + paddings
            var total = 5f;                            // content PaddingTop(5)
            foreach (var team in data.Teams)
            {
                var rows = (int)Math.Ceiling(team.Members.Count / (double)cols);
                total += teamHeaderH + rowSpacing + (rows * (cellH + rowSpacing));
            }
            return total;
        }

        var cellWidth = minCell;
        for (var cw = maxCell; cw >= minCell; cw -= 1f)
        {
            cellWidth = cw;
            if (EstimateHeight(cw) <= availHeight * 0.93f) break; // ~7% safety margin (estimate is approximate)
        }

        var photoSize = cellWidth * 0.786f;
        // Member photos are 3:4 portrait (camera capture is 600×800). Use a matching portrait box so the
        // photo FILLS it instead of being letterboxed inside a square (which made photos look smaller than
        // the grey placeholder). The placeholder uses the same box, so both render identically sized.
        var photoHeight = photoSize * 4f / 3f;
        var nameFontSize = Math.Clamp(cellWidth * 5f / 56f, 4f, 7f);
        var perRow = Math.Max(1, (int)(usableWidth / cellWidth)); // how many photo cells fit across one row

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
