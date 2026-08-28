import { forwardRef } from 'react'
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
// Falls back to a plain tel input if no dial code is set yet.
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { dialCode, value, onChange, ...rest }, ref,
) {
  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="tel"
      value={value}
      onChange={(e) => onChange(formatPhoneNational(dialCode, e.target.value))}
      {...rest}
    />
  )
})
