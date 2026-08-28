import { forwardRef, useLayoutEffect, useRef } from 'react'
import { AsYouType } from 'libphonenumber-js'
import { Input } from '@/components/ui/input'

// Phone-number formatting keyed off the selected dial code (e.g. "+961"). We derive the calling code
// (961) and let libphonenumber-js group the national number the way that country writes it
// (Lebanon → "76 123 456", "01 234 567"). Lebanon — the ~99% case here — formats correctly with the
// default (small) metadata bundle; a country libphonenumber can't confidently format is returned exactly
// as typed (harmless, never blocks). Everything is defensive and never throws.

// Format a raw national number for a dial code into that country's grouping. "" → "".
export function formatPhoneNational(dialCode: string | null | undefined, raw: string | null | undefined): string {
  const s = (raw ?? '').toString()
  const cc = (dialCode ?? '').replace(/\D/g, '')
  if (!s || !cc) return s
  try {
    return new AsYouType({ defaultCallingCode: cc }).input(s)
  } catch {
    return s
  }
}

// Full read-only display form, e.g. "+961 76 123 456" (for views where the dial code + number are separate).
export function formatPhoneDisplay(dialCode: string | null | undefined, number: string | null | undefined): string {
  const nat = formatPhoneNational(dialCode, number)
  const cc = (dialCode ?? '').trim()
  return [cc, nat].filter(Boolean).join(' ').trim()
}

type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value' | 'type'> & {
  dialCode?: string | null
  value: string
  onChange: (value: string) => void
}

// Controlled phone field that formats AS THE USER TYPES, based on the selected dial code. Stores the
// formatted national string (spaces are display-friendly; the backend caps length and matches on digits).
//
// Caret preservation: reformatting inserts grouping spaces, which by default snaps the caret to the end on
// every keystroke — visible as a flicker/jump, especially when editing mid-number. So we remember how many
// DIGITS were before the caret, reformat, then (in a layout effect, before paint) place the caret right after
// that same digit in the new string. Falls back to a plain tel input if no dial code is set yet.
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { dialCode, value, onChange, ...rest }, forwardedRef,
) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const caretRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (caretRef.current != null && inputRef.current) {
      const pos = caretRef.current
      caretRef.current = null
      try { inputRef.current.setSelectionRange(pos, pos) } catch { /* input may not support selection */ }
    }
  })

  const setRefs = (el: HTMLInputElement | null) => {
    inputRef.current = el
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const raw = el.value
    const selStart = el.selectionStart ?? raw.length
    // How many digit characters sit before the caret in what the user just typed.
    const digitsBeforeCaret = raw.slice(0, selStart).replace(/\D/g, '').length
    const formatted = formatPhoneNational(dialCode, raw)
    // Only restore the caret when the formatting actually changed the string (otherwise the browser's
    // natural caret is already correct, and touching it would fight the user).
    if (formatted !== raw) {
      let seen = 0
      let pos = formatted.length
      if (digitsBeforeCaret === 0) {
        pos = 0
      } else {
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            seen++
            if (seen === digitsBeforeCaret) { pos = i + 1; break }
          }
        }
      }
      caretRef.current = pos
    }
    onChange(formatted)
  }

  return (
    <Input
      ref={setRefs}
      type="tel"
      inputMode="tel"
      value={value}
      onChange={handleChange}
      {...rest}
    />
  )
})
