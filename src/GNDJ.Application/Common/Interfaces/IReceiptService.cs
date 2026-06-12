namespace GNDJ.Application.Common.Interfaces;

public record ReceiptPaymentLine(decimal Amount, string Currency, string PaymentMethod);

public record ReceiptData(
    string ReceiptNumber,
    string MemberName,
    string ScoutYear,
    List<ReceiptPaymentLine> Payments,
    DateOnly PaymentDate,
    string? Notes,
    string DefaultCurrency,
    Dictionary<string, decimal> ExchangeRates // e.g. { "LBP": 89500, "EUR": 0.92 } — rate per 1 USD
);

public interface IReceiptService
{
    byte[] GenerateReceipt(ReceiptData data);
}
