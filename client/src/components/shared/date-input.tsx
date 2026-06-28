import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Shared date entry field used across member/guardian forms and the demande wizard (DOB etc.).
// Auto-inserts the slashes as the user types digits, validates the calendar date, and emits ISO
// (yyyy-mm-dd) — or null while incomplete/invalid — through onChange.
//
// A controlled date field that DISPLAYS dates as dd/mm/yyyy (JJ/MM/AAAA) while keeping the value
// in ISO (yyyy-mm-dd). Avoids the native <input type="date"> picker, whose displayed format follows
// the browser locale and cannot be forced to dd/mm/yyyy.
function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

interface DateInputProps {
  value: string | null | undefined
  onChange: (iso: string | null) => void
  className?: string
  disabled?: boolean
}

export function DateInput({ value, onChange, className, disabled }: DateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value))

  // Re-sync when the value changes from outside (hydration, reset).
  useEffect(() => { setText(isoToDisplay(value)) }, [value])

  function handleChange(raw: string) {
    // Keep only digits (max 8 = ddmmyyyy) and re-insert slashes as they fill in.
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`
    setText(formatted)

    // Only emit an ISO value once a full 8-digit date is entered AND it's a real calendar date
    // (the round-trip through Date catches overflow like 31/02 rolling into March).
    if (digits.length === 8) {
      const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4)
      const d = Number(dd), mo = Number(mm), y = Number(yyyy)
      const dt = new Date(y, mo - 1, d)
      const valid = dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
      onChange(valid ? `${yyyy}-${mm}-${dd}` : null)
    } else {
      onChange(null)
    }
  }

  return (
    <Input
      inputMode="numeric"
      placeholder="JJ/MM/AAAA"
      value={text}
      maxLength={10}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value)}
      className={cn(className)}
    />
  )
}
