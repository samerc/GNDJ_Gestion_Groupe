using GNDJ.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Common;

// Membership-fee ("cotisation") payment maths, shared by every cotisation read (member tab, CG summary,
// unpaid/paid lists). Two independent computations:
//   1. "Paid in full or not" — PROPORTION PER CURRENCY. The CG sets a full price per currency (e.g. $30 AND
//      2 500 000 LBP), and each payment line counts as a fraction of ITS OWN currency's full price. So $15 is
//      50% and 1 250 000 LBP is 50%, and paying both = 100% (full). Paying exactly 2 500 000 LBP is always
//      "full" regardless of the current exchange rate — because the LBP price is set on its own, not derived
//      from the USD price × rate. A payment in a currency with NO configured full price falls back to being
//      converted into the reference currency via the exchange rate and measured against the reference full price.
//   2. "Equivalent total" — every payment converted into the org's reference (default) currency via the
//      exchange rate, summed. A rough "how much did we collect in USD" figure for the dashboard.
public static class CotisationCalc
{
    // Status strings surfaced in DTOs (kept as strings so they flow to the frontend without an enum mapping).
    public const string StatusPaid = "Paid";      // fee fully covered (fraction ≥ 1, or any payment when no full price is configured)
    public const string StatusPartial = "Partial"; // paid something but short of the full fee
    public const string StatusUnpaid = "Unpaid";   // no payment
    public const string StatusExempt = "Exempt";   // marked "ne paiera pas" (no payment)

    // Resolved cotisation settings for a scout year (loaded once, used in memory).
    // FullAmounts: full price per currency code. Rates: units of a currency per 1 reference currency
    // (e.g. LBP → 89500 means 1 USD = 89500 LBP), matching cotisation.exchange_rates / the receipt logic.
    public sealed record Config(string ReferenceCurrency, IReadOnlyDictionary<string, decimal> FullAmounts, IReadOnlyDictionary<string, decimal> Rates)
    {
        // Is a full price configured at all? When false, "partial" is meaningless, so any payment counts as paid.
        public bool HasFullPricing => FullAmounts.Values.Any(v => v > 0);

        // The full price in the reference currency (used to express the remaining amount owed). 0 when unset.
        public decimal ReferenceFull => FullAmounts.TryGetValue(ReferenceCurrency, out var v) ? v : 0m;
    }

    // Load the three cotisation settings in one round-trip.
    public static async Task<Config> LoadAsync(IApplicationDbContext ctx, CancellationToken ct)
    {
        var settings = await ctx.Settings
            .Where(s => s.Key == "cotisation.default_currency" || s.Key == "cotisation.exchange_rates" || s.Key == "cotisation.full_amounts")
            .ToDictionaryAsync(s => s.Key, s => s.Value, ct);

        var reference = settings.GetValueOrDefault("cotisation.default_currency", "USD");
        var rates = ParseMoneyMap(settings.GetValueOrDefault("cotisation.exchange_rates"));
        var fullAmounts = ParseMoneyMap(settings.GetValueOrDefault("cotisation.full_amounts"));
        return new Config(reference, fullAmounts, rates);
    }

    // Parse a { "CODE": number } JSON object (exchange rates / full amounts). Malformed → empty.
    private static Dictionary<string, decimal> ParseMoneyMap(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try
        {
            var parsed = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, decimal>>(json);
            return parsed ?? new();
        }
        catch { return new(); }
    }

    // Convert an amount into the reference currency. Same currency → as-is; known rate → amount / rate
    // (rate = units per 1 reference); unknown → best-effort as-is.
    public static decimal ToReference(decimal amount, string currency, Config cfg)
    {
        if (currency == cfg.ReferenceCurrency) return amount;
        return cfg.Rates.TryGetValue(currency, out var rate) && rate > 0 ? amount / rate : amount;
    }

    // Fraction of the full fee covered by these payments (proportion per currency; ≥ 1 = full).
    public static decimal Fraction(IEnumerable<(decimal Amount, string Currency)> payments, Config cfg)
    {
        decimal fraction = 0m;
        foreach (var (amount, currency) in payments)
        {
            if (cfg.FullAmounts.TryGetValue(currency, out var full) && full > 0)
            {
                fraction += amount / full;
            }
            else if (cfg.ReferenceFull > 0)
            {
                // No full price for this currency → convert to the reference and measure against the reference full price.
                fraction += ToReference(amount, currency, cfg) / cfg.ReferenceFull;
            }
            // else: no full price anywhere → can't measure this line (contributes 0; handled as a fallback in Evaluate).
        }
        return fraction;
    }

    // Sum of all payments converted into the reference currency (the "≈ $X" equivalent).
    public static decimal EquivalentInReference(IEnumerable<(decimal Amount, string Currency)> payments, Config cfg)
        => Math.Round(payments.Sum(p => ToReference(p.Amount, p.Currency, cfg)), 2);

    // Overall status of a member's cotisation for the year, plus the percentage paid and the amount still
    // owed expressed in the reference currency.
    public static (string Status, int Percent, decimal RemainingReference) Evaluate(
        IReadOnlyCollection<(decimal Amount, string Currency)> payments, bool willNotPay, Config cfg)
    {
        if (payments.Count == 0)
            return willNotPay ? (StatusExempt, 0, 0m) : (StatusUnpaid, 0, cfg.ReferenceFull);

        // No full pricing configured → binary: any payment = paid (preserves the old behaviour).
        if (!cfg.HasFullPricing)
            return (StatusPaid, 100, 0m);

        var fraction = Fraction(payments, cfg);
        var percent = (int)Math.Round(fraction * 100m, MidpointRounding.AwayFromZero);

        // 0.999 tolerance absorbs float/rounding noise so "exactly full" doesn't read as 99%.
        if (fraction >= 0.999m)
            return (StatusPaid, Math.Max(percent, 100), 0m);

        var remaining = cfg.ReferenceFull > 0 ? Math.Max(0m, Math.Round((1m - fraction) * cfg.ReferenceFull, 2)) : 0m;
        // Has payments but we couldn't measure them (e.g. a currency with no full price and no reference full
        // price) → treat as partial, not paid, so the CG notices rather than silently marking it settled.
        return (StatusPartial, Math.Max(percent, 0), remaining);
    }
}
