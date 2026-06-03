namespace GNDJ.Application.Common.Interfaces;

public record ReceiptData(
    string ReceiptNumber,
    string MemberName,
    string SchoolYear,
    decimal AmountPaid,
    string Currency,
    DateOnly PaymentDate,
    string PaymentMethod,
    string? Notes,
    string OrganizationName
);

public interface IReceiptService
{
    byte[] GenerateReceipt(ReceiptData data);
}
