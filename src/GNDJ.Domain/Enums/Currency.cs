namespace GNDJ.Domain.Enums;

// Supported payment currencies (multi-currency cotisations; converted via configured exchange rates for receipts).
public static class Currency
{
    public const string USD = "USD";
    public const string LBP = "LBP";
    public const string EUR = "EUR";

    public static readonly string[] All = [USD, LBP, EUR];
}
