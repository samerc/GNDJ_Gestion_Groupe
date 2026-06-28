using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A member's membership-fee record for one scout year (one row per member+year). Holds one or more
// Payments (multi-currency). "Paid" = has at least one payment line; an exemption-only row (WillNotPay)
// has none and an empty receipt number.
public class MemberCotisation : BaseEntity
{
    public Guid MemberId { get; set; }
    public string ScoutYear { get; set; } = string.Empty; // e.g. "2025-2026"
    public DateOnly PaymentDate { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty; // e.g. "GNDJ-2025-0001"
    public string? Notes { get; set; }
    // CU/CG mark: this member will not pay (exempt) for this scout year. Shared between roles
    // (the flag lives on the per-member-per-year row, so whoever sets it, both see it).
    // An exemption-only row has no Payments and an empty ReceiptNumber.
    public bool WillNotPay { get; set; }

    public Member Member { get; set; } = null!;
    public ICollection<CotisationPayment> Payments { get; set; } = [];
}
