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
