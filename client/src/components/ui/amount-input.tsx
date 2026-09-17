import { forwardRef, useLayoutEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

// Group an integer-digit string with thousands separators: "2500000" → "2,500,000".
function groupInt(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Format a raw amount string (digits + at most one dot) with comma thousands separators, preserving a decimal
// part the user is typing (incl. a trailing "."). "2500000" → "2,500,000"; "2500000.5" → "2,500,000.5".
export function formatAmountText(raw: string): string {
  const cleaned = String(raw).replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot < 0) return groupInt(cleaned.replace(/^0+(?=\d)/, ''))
  const intp = cleaned.slice(0, dot).replace(/^0+(?=\d)/, '')
  const decp = cleaned.slice(dot + 1).replace(/\./g, '') // ignore any extra dots
  return `${groupInt(intp || '0')}.${decp}`
}

// Parse a formatted amount string back to a number (strip the commas). Empty/invalid → 0.
export function parseAmount(raw: string): number {
  const n = Number(String(raw).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | string
  onValueChange: (n: number) => void
}

// A text input that shows a number with comma thousands separators as you type (e.g. 2,500,000) while emitting a
// plain number to the caller. For MONEY/amount fields only — never years or small counts (grouping a year is wrong).
// Preserves the caret across reformatting by counting the digit/dot characters before it (same trick as PhoneInput).
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { value, onValueChange, ...rest }, ref,
) {
  const toText = (v: number | string) => (v === '' || v === 0 || v == null) ? '' : formatAmountText(String(v))
  const [text, setText] = useState(() => toText(value))
  // Re-sync when the external value changes to something the current text doesn't represent (e.g. a form reset).
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (parseAmount(text) !== Number(value)) setText(toText(value))
  }

  const localRef = useRef<HTMLInputElement | null>(null)
  const caretDigits = useRef<number | null>(null)
  const setRefs = (el: HTMLInputElement | null) => {
    localRef.current = el
    if (typeof ref === 'function') ref(el); else if (ref) ref.current = el
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const before = el.value.slice(0, el.selectionStart ?? el.value.length)
    caretDigits.current = (before.match(/[\d.]/g) || []).length // digits/dots left of the caret
    const formatted = formatAmountText(el.value)
    setText(formatted)
    onValueChange(parseAmount(formatted))
  }

  // Restore the caret to just after the same number of digit/dot chars (grouping commas shifted it).
  useLayoutEffect(() => {
    if (caretDigits.current == null || !localRef.current) return
    const s = localRef.current.value
    let seen = 0, pos = 0
    for (; pos < s.length; pos++) { if (/[\d.]/.test(s[pos])) { seen++; if (seen >= caretDigits.current) { pos++; break } } }
    localRef.current.setSelectionRange(pos, pos)
    caretDigits.current = null
  })

  return <Input ref={setRefs} type="text" inputMode="decimal" value={text} onChange={handleChange} {...rest} />
})
