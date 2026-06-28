using GNDJ.Application.Common.Interfaces;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GNDJ.Infrastructure.Services;

// Generates a cotisation (membership-fee) receipt as an A5-landscape PDF (QuestPDF): logo header,
// member/year/receipt-number block, a per-payment-line table (multi-currency), and a total converted
// into the org's default currency via configured exchange rates. Includes a signature line in the footer.
public class ReceiptService : IReceiptService
{
    public byte[] GenerateReceipt(ReceiptData data)
    {
        // Try to load logo
        byte[]? logoBytes = null;
        var logoPath = Path.Combine(AppContext.BaseDirectory, "Assets", "header-logo.jpg");
        if (File.Exists(logoPath))
            logoBytes = File.ReadAllBytes(logoPath);

        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A5.Landscape());
                page.Margin(25);
                page.DefaultTextStyle(x => x.FontSize(10));

                page.Header().Column(col =>
                {
                    // Logo header
                    if (logoBytes is not null)
                    {
                        col.Item().AlignCenter().MaxHeight(60).Image(logoBytes);
                    }
                    col.Item().PaddingTop(8).AlignCenter().Text("Reçu de cotisation")
                        .FontSize(14).SemiBold();
                    col.Item().PaddingTop(6).LineHorizontal(1);
                });

                page.Content().PaddingTop(15).Column(col =>
                {
                    col.Spacing(6);

                    // Receipt info row
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

                    // Member + year row
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Text(t =>
                        {
                            t.Span("Reçu de : ").SemiBold();
                            t.Span(data.MemberName);
                        });
                        row.RelativeItem().AlignRight().Text(t =>
                        {
                            t.Span("Année scoute : ").SemiBold();
                            t.Span(data.ScoutYear);
                        });
                    });

                    // Payment table
                    col.Item().PaddingTop(10).Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(4); // Description
                            columns.RelativeColumn(2); // Montant
                            columns.RelativeColumn(1); // Devise
                            columns.RelativeColumn(2); // Mode de paiement
                        });

                        // Header
                        table.Header(header =>
                        {
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(6).Text("Description").SemiBold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(6).AlignRight().Text("Montant").SemiBold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(6).AlignCenter().Text("Devise").SemiBold();
                            header.Cell().Background(Colors.Grey.Lighten3).Padding(6).Text("Mode de paiement").SemiBold();
                        });

                        // Payment lines
                        foreach (var payment in data.Payments)
                        {
                            var methodLabel = payment.PaymentMethod switch
                            {
                                "Cash" => "Espèces",
                                "Virement" => "Virement bancaire",
                                _ => payment.PaymentMethod
                            };
                            table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(5).Text("Cotisation annuelle");
                            table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(5).AlignRight().Text(FormatNumber(payment.Amount));
                            table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(5).AlignCenter().Text(payment.Currency);
                            table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2).Padding(5).Text(methodLabel);
                        }

                        // Total row (convert to default currency)
                        if (data.Payments.Count > 0)
                        {
                            var totalInDefault = CalculateTotal(data.Payments, data.DefaultCurrency, data.ExchangeRates);

                            table.Cell().Background(Colors.Grey.Lighten4).Padding(6).Text("Total").Bold();
                            table.Cell().Background(Colors.Grey.Lighten4).Padding(6).AlignRight().Text(FormatNumber(totalInDefault)).Bold();
                            table.Cell().Background(Colors.Grey.Lighten4).Padding(6).AlignCenter().Text(data.DefaultCurrency).Bold();
                            table.Cell().Background(Colors.Grey.Lighten4).Padding(6).Text("");
                        }
                    });

                    if (!string.IsNullOrWhiteSpace(data.Notes))
                    {
                        col.Item().PaddingTop(8).Text(t =>
                        {
                            t.Span("Notes : ").SemiBold();
                            t.Span(data.Notes);
                        });
                    }
                });

                page.Footer().Column(col =>
                {
                    col.Item().LineHorizontal(1);
                    col.Item().PaddingTop(8).Row(row =>
                    {
                        row.RelativeItem().Text("Signature : ____________________").FontSize(9);
                        row.RelativeItem().AlignRight().Text($"Généré le {DateTime.Now:dd/MM/yyyy}").FontSize(8).Italic();
                    });
                });
            });
        });

        return document.GeneratePdf();
    }

    private static decimal CalculateTotal(List<ReceiptPaymentLine> payments, string defaultCurrency, Dictionary<string, decimal> rates)
    {
        decimal total = 0;
        foreach (var p in payments)
        {
            if (p.Currency == defaultCurrency)
            {
                total += p.Amount;
            }
            else if (rates.TryGetValue(p.Currency, out var rate) && rate > 0)
            {
                // rate = how many units of this currency per 1 default currency
                total += p.Amount / rate;
            }
            else
            {
                // No rate available — skip conversion, just add as-is (best effort)
                total += p.Amount;
            }
        }
        return Math.Round(total, 2);
    }

    private static string FormatNumber(decimal amount)
    {
        return amount.ToString("N2");
    }
}
