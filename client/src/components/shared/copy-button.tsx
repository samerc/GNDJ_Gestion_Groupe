import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// One-click copy of a value (email/phone/etc.) to the clipboard, with a brief ✓ confirmation. Used in leader
// contact views so a chef can grab a number/email without selecting text. Renders nothing for an empty value.
export function CopyButton({ value, label, className }: { value: string | null | undefined; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation()
    // navigator.clipboard needs a secure context; fall back to a hidden textarea otherwise.
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(() => {})
    } else {
      try {
        const ta = document.createElement('textarea')
        ta.value = value; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
        done()
      } catch { /* ignore */ }
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copié !' : (label ?? 'Copier')}
      aria-label={label ?? 'Copier'}
      className={cn('inline-flex shrink-0 items-center text-muted-foreground/70 transition-colors hover:text-foreground', className)}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}
