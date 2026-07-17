using GNDJ.Application.Common.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

// Generates credit-card-sized member ID cards (QuestPDF). Two modes: a single card on a card-sized
// page, and a bulk A4 sheet laying out 2×5 = 10 cards with thin cut guides between them for scissors.
// Card content is configurable via CardSettings (which fields to show + org name).
public class MemberCardService : IMemberCardService
{
    // Card geometry in PDF points (1pt = 1/72"); a standard ID-1 / credit-card face is 85.6×54mm.
    private const float CardWidth = 242; // 85.6mm
    private const float CardHeight = 153; // 53.98mm
    private const int CardsPerRow = 2;    // bulk sheet: 2 cards across × 5 down = 10 per A4 page
    private const int CardsPerCol = 5;
    private const float CutLineMargin = 8;

    public byte[] Generate(MemberCardData data, CardSettings settings)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(CardWidth, CardHeight, Unit.Point);
                page.Margin(8);
                page.DefaultTextStyle(x => x.FontSize(7));
                page.Content().Element(c => RenderCard(c, data, settings));
            });
        });

        return document.GeneratePdf();
    }

    public byte[] GenerateBulk(IReadOnlyList<MemberCardData> cards, CardSettings settings)
    {
        var document = Document.Create(container =>
        {
            // Calculate cards per page
            var totalPages = (int)Math.Ceiling(cards.Count / (double)(CardsPerRow * CardsPerCol));

            for (int pageIdx = 0; pageIdx < totalPages; pageIdx++)
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(15);
                    page.DefaultTextStyle(x => x.FontSize(7));

                    page.Content().Column(col =>
                    {
                        var startIdx = pageIdx * CardsPerRow * CardsPerCol;

                        for (int rowIdx = 0; rowIdx < CardsPerCol; rowIdx++)
                        {
                            var cardIdx = startIdx + rowIdx * CardsPerRow;
                            if (cardIdx >= cards.Count) break;

                            // Thin cut line between rows (not before first)
                            if (rowIdx > 0)
                            {
                                col.Item().PaddingVertical(CutLineMargin / 2)
                                    .LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten1);
                            }

                            col.Item().Row(row =>
                            {
                                for (int colIdx = 0; colIdx < CardsPerRow; colIdx++)
                                {
                                    var idx = cardIdx + colIdx;

                                    // Thin cut line between columns (not before first)
                                    if (colIdx > 0)
                                    {
                                        row.ConstantItem(CutLineMargin)
                                            .AlignCenter()
                                            .LineVertical(0.5f).LineColor(Colors.Grey.Lighten1);
                                    }

                                    if (idx < cards.Count)
                                    {
                                        row.ConstantItem(CardWidth).Height(CardHeight)
                                            .Border(0.3f).BorderColor(Colors.Grey.Lighten2)
                                            .Padding(8)
                                            .Element(c => RenderCard(c, cards[idx], settings));
                                    }
                                    else
                                    {
                                        row.ConstantItem(CardWidth).Height(CardHeight);
                                    }
                                }
                                row.RelativeItem(); // fill
                            });
                        }
                    });

                    page.Footer().AlignCenter().DefaultTextStyle(x => x.FontSize(6))
                        .Text(t => { t.Span("Page "); t.CurrentPageNumber(); t.Span(" / "); t.TotalPages(); });
                });
            }
        });

        return document.GeneratePdf();
    }

    private static void RenderCard(IContainer container, MemberCardData data, CardSettings settings)
    {
        container.Column(col =>
        {
            // Org name
            col.Item().AlignCenter().Text(settings.OrgName).FontSize(8).Bold();
            col.Item().PaddingTop(2).LineHorizontal(0.5f);

            // Main content: photo + info
            col.Item().PaddingTop(4).Row(row =>
            {
                // Photo
                if (settings.Fields.Photo)
                {
                    row.ConstantItem(50).Column(photoCol =>
                    {
                        var photoRendered = false;
                        if (!string.IsNullOrEmpty(data.PhotoPath))
                        {
                            var fullPath = Path.Combine(Directory.GetCurrentDirectory(), data.PhotoPath);
                            if (File.Exists(fullPath))
                            {
                                try
                                {
                                    photoCol.Item().Width(45).Height(50).Image(fullPath).FitArea();
                                    photoRendered = true;
                                }
                                catch { } // corrupt/unreadable image — fall through to the initials placeholder
                            }
                        }
                        // No usable photo: draw a grey tile with the member's initials instead
                        if (!photoRendered)
                        {
                            var initials = GetInitials(data.MemberName);
                            photoCol.Item().Width(45).Height(50)
                                .Background(Colors.Grey.Lighten2)
                                .AlignCenter().AlignMiddle()
                                .Text(initials).FontSize(16).FontColor(Colors.Grey.Darken1);
                        }
                    });
                }

                // Info
                row.RelativeItem().PaddingLeft(settings.Fields.Photo ? 6 : 0).Column(info =>
                {
                    if (settings.Fields.Name)
                        info.Item().Text(data.MemberName).FontSize(9).Bold();
                    if (settings.Fields.CardNumber && !string.IsNullOrEmpty(data.CardNumber))
                        info.Item().PaddingTop(1).Text($"N° {data.CardNumber}").FontSize(7);
                    if (settings.Fields.Unit && !string.IsNullOrEmpty(data.UnitName))
                        info.Item().PaddingTop(1).Text(data.UnitName).FontSize(6.5f);
                    if (settings.Fields.Team && !string.IsNullOrEmpty(data.TeamName))
                        info.Item().Text(data.TeamName).FontSize(6.5f);
                    if (settings.Fields.Role && !string.IsNullOrEmpty(data.RoleName))
                        info.Item().Text(data.RoleName).FontSize(6).Italic();
                    if (settings.Fields.DateOfBirth && !string.IsNullOrEmpty(data.DateOfBirth))
                        info.Item().PaddingTop(1).Text($"Né(e) le {data.DateOfBirth}").FontSize(6);
                });
            });

            // Bottom section
            var hasBottom = (settings.Fields.BloodType && !string.IsNullOrEmpty(data.BloodType))
                || (settings.Fields.EmergencyContact && !string.IsNullOrEmpty(data.EmergencyContact));

            if (hasBottom)
            {
                col.Item().PaddingTop(3).LineHorizontal(0.3f);
                col.Item().PaddingTop(2).Row(row =>
                {
                    if (settings.Fields.BloodType && !string.IsNullOrEmpty(data.BloodType))
                        row.ConstantItem(50).Text($"Sang: {data.BloodType}").FontSize(6);
                    if (settings.Fields.EmergencyContact && !string.IsNullOrEmpty(data.EmergencyContact))
                        row.RelativeItem().Text($"Urgence: {data.EmergencyContact}").FontSize(5.5f);
                });
            }

            // Custom fields
            if (settings.Fields.CustomFields)
            {
                foreach (var cf in data.CustomFields)
                {
                    col.Item().Text($"{cf.Name}: {cf.Value}").FontSize(5.5f);
                }
            }
        });
    }

    private static string GetInitials(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "?";
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 2) return $"{parts[0][0]}{parts[^1][0]}";
        if (parts.Length == 1) return parts[0][..1];
        return "?";
    }
}
