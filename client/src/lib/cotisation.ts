// Parse a { "CODE": number } JSON object (exchange rates / full amounts). Malformed → empty.
export function parseMoneyMap(raw: string | null | undefined): Record<string, number> {
  try { return raw ? (JSON.parse(raw) as Record<string, number>) : {} } catch { return {} }
}

// A defined cotisation currency: its code, its exchange rate (units per 1 reference currency; 1 for the
// reference), and whether it is the reference/default currency.
export interface CurrencyDef { code: string; rate: number; isDefault: boolean }

// The ordered list of defined currencies, derived from the two cotisation settings — the SINGLE source of
// truth for "which currencies exist". The default (reference) currency comes first with rate 1 (its rate is
// not editable — everything is expressed relative to it); every other currency comes from the exchange-rate
// map with its own rate. Currencies are fully customizable this way (add/remove in Paramètres → Cotisations).
export function buildCurrencies(defaultCurrency: string | null | undefined, exchangeRatesRaw: string | null | undefined): CurrencyDef[] {
  const def = (defaultCurrency || 'USD').toUpperCase()
  const rates = parseMoneyMap(exchangeRatesRaw)
  const others = Object.entries(rates)
    .filter(([c]) => c.toUpperCase() !== def)
    .map(([code, rate]) => ({ code: code.toUpperCase(), rate: Number(rate) || 0, isDefault: false }))
    .sort((a, b) => a.code.localeCompare(b.code))
  return [{ code: def, rate: 1, isDefault: true }, ...others]
}

// The configured full cotisation price for a currency (from cotisation.full_amounts), or undefined if none set.
export function fullAmountFor(fullAmountsRaw: string | null | undefined, currency: string): number | undefined {
  const v = parseMoneyMap(fullAmountsRaw)[currency]
  return typeof v === 'number' && v > 0 ? v : undefined
}

// Short display label for a currency: code + a known symbol when we have one (USD ($), LBP (ل.ل), EUR (€)),
// else just the code (a custom currency shows plainly, e.g. "AED").
const KNOWN_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', LBP: 'ل.ل' }
export function currencyLabel(code: string): string {
  const s = KNOWN_SYMBOLS[code]
  return s ? `${code} (${s})` : code
}

// When the CG switches a payment line's currency, re-fill the amount with the NEW currency's full price — but
// ONLY when the amount looks un-edited (blank/zero, or still equal to the OLD currency's full price, i.e. it was
// the prefill and not a value the CG typed). A manually-typed amount is left untouched. Returns the new amount
// (0 = clear, so the CG types it) — avoids the trap of paying e.g. "30 LBP" after switching USD→LBP.
export function amountOnCurrencyChange(
  fullAmountsRaw: string | null | undefined,
  oldCurrency: string, newCurrency: string, currentAmount: number,
): number {
  if (oldCurrency === newCurrency) return currentAmount
  const oldFull = fullAmountFor(fullAmountsRaw, oldCurrency)
  const pristine = currentAmount <= 0 || (oldFull !== undefined && currentAmount === oldFull)
  if (!pristine) return currentAmount
  return fullAmountFor(fullAmountsRaw, newCurrency) ?? 0
}

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
  const full = parseMoneyMap(fullAmountsRaw)
  const pick = full[currency] ?? full.USD ?? Object.values(full).find(v => v > 0)
  const amount = typeof pick === 'number' && pick > 0 ? pick : (parseFloat(fallbackAmount ?? '') || 0)
  return { amount, currency }
}
