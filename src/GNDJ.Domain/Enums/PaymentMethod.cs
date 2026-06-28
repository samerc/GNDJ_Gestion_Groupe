namespace GNDJ.Domain.Enums;

// How a cotisation payment was made (stored as a string on CotisationPayment).
public static class PaymentMethod
{
    public const string Cash = "Cash";
    public const string BankTransfer = "Virement";
    public const string Other = "Autre";
}
