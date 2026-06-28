using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// One payment line on a MemberCotisation (a cotisation can be settled in several currencies/installments).
public class CotisationPayment : BaseEntity
{
    public Guid CotisationId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = Enums.Currency.USD;
    public string PaymentMethod { get; set; } = Enums.PaymentMethod.Cash;

    public MemberCotisation Cotisation { get; set; } = null!;
}
