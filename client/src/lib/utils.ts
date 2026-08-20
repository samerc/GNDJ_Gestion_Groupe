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

// A cotisation amount with its currency symbol ($, €, or ل.ل for LBP), fr-FR grouping, 2 decimals.
export function formatMoney(amount: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'ل.ل'
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${symbol}`
}

// Derive a plain-text meta description from CMS body HTML: strip tags, collapse whitespace, truncate.
// Not for rendering (that goes through DOMPurify) — only for <meta> text, where tags are inert.
export function metaFromHtml(html: string | null | undefined, max = 160): string | undefined {
  if (!html) return undefined
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
