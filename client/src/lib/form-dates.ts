// Date blanks of the « remplir en ligne » forms. Parents often only know the year (or month and year) of a
// vaccine booster, so a date blank accepts, typed in the French order:
//   JJ/MM/AAAA (also 1/6/19, 01.06.2019, 01-06-2019) → sent as yyyy-MM-dd (printed JJ/MM/AAAA on the PDF)
//   MM/AAAA                                          → sent as MM/yyyy
//   AAAA                                             → sent as yyyy
// The server accepts exactly these three forms (OnlineDocumentFormHandlers).

const pad = (n: number) => String(n).padStart(2, '0')

// Typed text → value to send; '' for an empty field, null when it can't be read.
export function normalizeFormDate(text: string): string | null {
  const t = text.trim()
  if (!t) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t // already normalized (prefill)
  // Digits only: the iPhone numeric keypad has no « / », so 01062019 / 062019 / 2019 must work as typed.
  const digitsOnly = /^\d+$/.test(t) ? splitDigits(t) : null
  if (/^\d+$/.test(t) && !digitsOnly) return null
  const parts = digitsOnly ?? t.split(/[\s/.,-]+/).filter(Boolean)
  if (!parts.every((p) => /^\d+$/.test(p))) return null
  const year = (p: string) => {
    if (p.length === 4) return Number(p)
    if (p.length === 2) { const n = Number(p); const now = new Date().getFullYear() % 100; return n <= now ? 2000 + n : 1900 + n }
    return NaN
  }
  const okYear = (y: number) => y >= 1900 && y <= 2100
  if (parts.length === 1) { const y = Number(parts[0]); return parts[0].length === 4 && okYear(y) ? String(y) : null }
  if (parts.length === 2) {
    const m = Number(parts[0]); const y = year(parts[1])
    return m >= 1 && m <= 12 && okYear(y) ? `${pad(m)}/${y}` : null
  }
  if (parts.length === 3) {
    const d = Number(parts[0]); const m = Number(parts[1]); const y = year(parts[2])
    if (!okYear(y) || m < 1 || m > 12 || d < 1) return null
    const dt = new Date(y, m - 1, d)
    if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null // 31/02 etc.
    return `${y}-${pad(m)}-${pad(d)}`
  }
  return null
}

// A run of digits typed without separators → its parts: 8 = JJMMAAAA, 6 = MMAAAA (when the last 4 read as a
// year, e.g. 062019) else JJMMAA, 4 = AAAA. Other lengths are ambiguous → null (the field shows red).
function splitDigits(t: string): string[] | null {
  if (t.length === 8) return [t.slice(0, 2), t.slice(2, 4), t.slice(4)]
  if (t.length === 6) {
    const y = Number(t.slice(2))
    return y >= 1900 && y <= 2100 ? [t.slice(0, 2), t.slice(2)] : [t.slice(0, 2), t.slice(2, 4), t.slice(4)]
  }
  if (t.length === 4) return [t]
  return null
}

// Stored value (yyyy-MM-dd / MM/yyyy / yyyy) → what the parent sees in the field.
export function displayFormDate(value: string | undefined): string {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}
