using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class MemberCotisation : BaseEntity
{
    public Guid MemberId { get; set; }
    public string SchoolYear { get; set; } = string.Empty; // e.g. "2025-2026"
    public decimal AmountPaid { get; set; }
    public string Currency { get; set; } = Enums.Currency.USD;
    public DateOnly PaymentDate { get; set; }
    public string PaymentMethod { get; set; } = Enums.PaymentMethod.Cash;
    public string ReceiptNumber { get; set; } = string.Empty; // e.g. "GNDJ-2025-0001"
    public string? Notes { get; set; }

    public Member Member { get; set; } = null!;
}
