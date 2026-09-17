import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Merge conditional class names (clsx) then dedupe conflicting Tailwind classes (tailwind-merge).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Whole-years age from an ISO/date string; null if missing, unparseable, or out of a sane range.
export function computeAge(dob: string | null | undefined): number | null {
  if (!dob) return null
  const b = new Date(dob)
  if (isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

// Long French date, e.g. "5 juillet 2026"; empty string for null/blank.
export function formatDateLong(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Parse a JSON array string defensively, returning [] on null/empty/malformed input instead of throwing.
// Use for DB-sourced JSON columns (e.g. a report template's columnsJson) read DURING RENDER — a legacy,
// empty, or hand-edited row must not white-screen the page with an uncaught SyntaxError.
export function safeJsonArray<T = string>(json: string | null | undefined): T[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

// Runtime currency → symbol registry. Seeded with the common defaults, then updated from the customizable
// cotisation.currency_symbols setting (see CurrencySymbolsSync, mounted in AppLayout) so any currency the CG
// defines shows its own symbol. A currency with no symbol falls back to its code (e.g. "100,00 AED").
const currencySymbols: Record<string, string> = { USD: '$', EUR: '€', LBP: 'ل.ل' }
export function setCurrencySymbols(map: Record<string, string>) {
  for (const [k, v] of Object.entries(map)) {
    const code = k.trim().toUpperCase()
    if (code) currencySymbols[code] = (v ?? '').trim() || code // blank symbol → show the code
  }
}
export function currencySymbol(code: string): string { return currencySymbols[code] || code }

// A cotisation amount with its currency symbol (from the registry, else the code). Comma thousands separators +
// period decimals (English/Lebanese convention, matching the AmountInput fields), 2 decimals — e.g. "2,500,000.00 ل.ل".
export function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol(currency)}`
}

// Derive a plain-text meta description from CMS body HTML: strip tags, collapse whitespace, truncate.
// Not for rendering (that goes through DOMPurify) — only for <meta> text, where tags are inert.
export function metaFromHtml(html: string | null | undefined, max = 160): string | undefined {
  if (!html) return undefined
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
