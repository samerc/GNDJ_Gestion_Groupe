using GNDJ.Application.Common.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

public class ReceiptService : IReceiptService
{
    public byte[] GenerateReceipt(ReceiptData data)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A5);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(11));

                page.Header().Column(col =>
                {
                    col.Item().AlignCenter().Text(data.OrganizationName)
                        .FontSize(16).Bold();
                    col.Item().AlignCenter().PaddingTop(5).Text("Reçu de cotisation")
                        .FontSize(14).SemiBold();
                    col.Item().PaddingTop(10).LineHorizontal(1);
                });

                page.Content().PaddingTop(20).Column(col =>
                {
                    col.Spacing(8);

                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Text(t =>
                        {
                            t.Span("N° de reçu : ").SemiBold();
                            t.Span(data.ReceiptNumber);
                        });
                        row.RelativeItem().AlignRight().Text(t =>
                        {
                            t.Span("Date : ").SemiBold();
                            t.Span(data.PaymentDate.ToString("dd/MM/yyyy"));
                        });
                    });

                    col.Item().PaddingTop(10).Text(t =>
                    {
                        t.Span("Reçu de : ").SemiBold();
                        t.Span(data.MemberName);
                    });

                    col.Item().Text(t =>
                    {
                        t.Span("Année scoute : ").SemiBold();
                        t.Span(data.SchoolYear);
                    });

                    col.Item().PaddingTop(10).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                        });

                        // Header
                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).Text("Description").SemiBold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).AlignRight().Text("Montant").SemiBold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(5).AlignRight().Text("Devise").SemiBold();
                        });

                        // Row
                        table.Cell().Padding(5).Text("Cotisation annuelle");
                        table.Cell().Padding(5).AlignRight().Text(data.AmountPaid.ToString("N2"));
                        table.Cell().Padding(5).AlignRight().Text(data.Currency);
                    });

                    col.Item().PaddingTop(5).Text(t =>
                    {
                        t.Span("Mode de paiement : ").SemiBold();
                        t.Span(data.PaymentMethod);
                    });

                    if (!string.IsNullOrWhiteSpace(data.Notes))
                    {
                        col.Item().PaddingTop(5).Text(t =>
                        {
                            t.Span("Notes : ").SemiBold();
                            t.Span(data.Notes);
                        });
                    }
                });

                page.Footer().Column(col =>
                {
                    col.Item().LineHorizontal(1);
                    col.Item().PaddingTop(10).Row(row =>
                    {
                        row.RelativeItem().Text("Signature : ____________________").FontSize(10);
                        row.RelativeItem().AlignRight().Text($"Généré le {DateTime.Now:dd/MM/yyyy}").FontSize(9).Italic();
                    });
                });
            });
        });

        return document.GeneratePdf();
    }
}
