// Derive the default first payment line (amount + currency) for the record-payment forms from the configured
// full cotisation price per currency (cotisation.full_amounts) — the single place the cotisation amount is set.
// Prefers the reference/default currency's full price, else USD, else the first configured currency; falls back
// to the legacy cotisation.default_amount, else 0 (blank). Keeps the payment dialogs pre-filled with the real fee.
export function defaultPaymentLine(
  fullAmountsRaw: string | null | undefined,
  defaultCurrency: string | null | undefined,
  fallbackAmount?: string | null,
): { amount: number; currency: string } {
  const currency = defaultCurrency || 'USD'
  let full: Record<string, number> = {}
  try { full = fullAmountsRaw ? (JSON.parse(fullAmountsRaw) as Record<string, number>) : {} } catch { /* ignore malformed json */ }
  const pick = full[currency] ?? full.USD ?? Object.values(full).find(v => v > 0)
  const amount = typeof pick === 'number' && pick > 0 ? pick : (parseFloat(fallbackAmount ?? '') || 0)
  return { amount, currency }
}
