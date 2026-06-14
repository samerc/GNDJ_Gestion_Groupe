import { memo } from 'react'

// Honeypot anti-bot field. Hidden from real users (positioned off-screen, no tab stop, aria-hidden)
// but naive bots auto-fill every input — so a non-empty value flags a bot. The backend rejects any
// submission whose "website" field is non-empty (see AbuseDetectionMiddleware). Include the value as
// `website` in the request payload.
//
// Usage:
//   const [hp, setHp] = useState('')
//   <HoneypotField value={hp} onChange={setHp} />
//   ...submit with { ...payload, website: hp }
export const HoneypotField = memo(function HoneypotField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
      <label htmlFor="website">Ne pas remplir ce champ</label>
      <input
        id="website"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
})
