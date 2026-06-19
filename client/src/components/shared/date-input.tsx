import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`
    setText(formatted)

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
