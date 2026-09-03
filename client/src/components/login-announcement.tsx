import { Megaphone } from 'lucide-react'

// A prominent, admin-editable announcement banner shown at the top of a login screen. Driven by the
// login.member_message / login.applicant_message settings (via each screen's public config). Renders nothing
// when there's no message. `tone` matches the screen's theme (member = primary/navy, applicant = accent/teal)
// so it reads as part of that screen. Multi-line messages are preserved (whitespace-pre-line); long words wrap.
export function LoginAnnouncement({ message, tone = 'primary' }: { message?: string | null; tone?: 'primary' | 'accent' }) {
  const text = message?.trim()
  if (!text) return null
  // border-2 + shadow give it real presence above the card so it can't be missed ("visible et clair").
  const box = tone === 'accent'
    ? 'border-accent/50 bg-accent/10'
    : 'border-primary/50 bg-primary/10'
  const icon = tone === 'accent' ? 'text-accent' : 'text-primary'
  return (
    <div className={`mb-6 flex items-start gap-3 rounded-xl border-2 px-4 py-3.5 shadow-card ${box}`} role="status">
      <Megaphone className={`mt-0.5 h-5 w-5 shrink-0 ${icon}`} />
      <p className="whitespace-pre-line break-words text-sm font-medium leading-relaxed text-foreground">{text}</p>
    </div>
  )
}
