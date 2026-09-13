// Helpers to turn a stored phone (dial code + national number) into a WhatsApp / tel link.
// Leader-only feature: families here run on WhatsApp, so a CU/CG can start a chat in one tap.

// Build the international digits for wa.me: <countrycode><number>, digits only, no "+", one leading 0 dropped.
// Numbers are ~99% Lebanese; if the country code is missing (some legacy imported numbers), assume Lebanon (961).
export function whatsappDigits(countryCode: string | null | undefined, number: string | null | undefined): string | null {
  let cc = (countryCode ?? '').replace(/\D/g, '')
  let n = (number ?? '').replace(/\D/g, '')
  if (!n) return null
  n = n.replace(/^0+/, '') // drop leading zero(s) — international form omits the trunk 0
  if (!cc) cc = '961' // default to Lebanon when no dial code is stored
  const full = cc + n
  return full.length >= 8 ? full : null // guard against junk / too-short numbers
}

// https://wa.me/<digits> or null when the number can't form a usable link.
export function whatsappHref(countryCode: string | null | undefined, number: string | null | undefined): string | null {
  const d = whatsappDigits(countryCode, number)
  return d ? `https://wa.me/${d}` : null
}

// Variant for an already-combined display string (e.g. "+961 76 123 456"), where the country code may already
// be baked in. Lebanon-first heuristic: keep an existing 961/other international prefix; otherwise treat it as a
// local number and prefix 961 (dropping the trunk 0). ~99% of numbers here are Lebanese.
export function whatsappHrefFromText(text: string | null | undefined): string | null {
  let d = (text ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('961')) {
    // already international
  } else if (d.startsWith('00')) {
    d = d.replace(/^0+/, '') // 00<cc>… international prefix → drop the 00
  } else if (d.startsWith('0')) {
    d = '961' + d.replace(/^0+/, '') // local with trunk 0 → Lebanon international
  } else if (d.length <= 8) {
    d = '961' + d // bare local number → Lebanon
  } // else: already carries some country code, use as-is
  return d.length >= 8 ? `https://wa.me/${d}` : null
}

// tel: link (spaces stripped) or null.
export function telHref(countryCode: string | null | undefined, number: string | null | undefined): string | null {
  const cc = (countryCode ?? '').replace(/[^\d+]/g, '')
  const n = (number ?? '').replace(/\s+/g, '')
  const combined = `${cc}${n}`.trim()
  return combined ? `tel:${combined}` : null
}
