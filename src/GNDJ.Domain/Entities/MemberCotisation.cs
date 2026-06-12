using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

public class MemberCotisation : BaseEntity
{
    public Guid MemberId { get; set; }
    public string ScoutYear { get; set; } = string.Empty; // e.g. "2025-2026"
    public DateOnly PaymentDate { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty; // e.g. "GNDJ-2025-0001"
    public string? Notes { get; set; }

    public Member Member { get; set; } = null!;
    public ICollection<CotisationPayment> Payments { get; set; } = [];
}
