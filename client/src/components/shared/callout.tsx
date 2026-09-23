import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger' | 'muted'

// Tinted, dark-mode-aware surfaces for each status family — replaces hand-picked bg-amber-50 / bg-emerald-50
// / bg-red-50 banner boxes scattered across pages with one tokenized source of truth.
const toneClasses: Record<CalloutTone, string> = {
  info: 'border-info-border bg-info-subtle',
  success: 'border-success-border bg-success-subtle',
  warning: 'border-warning-border bg-warning-subtle',
  danger: 'border-destructive-border bg-destructive-subtle',
  muted: 'border-border bg-muted/50',
}
const iconTone: Record<CalloutTone, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
}

// Status banner (info / success / warning / danger / muted). `title` is emphasized; `children` holds the body
// text and any actions. Use for the "à traiter", "attention", "mode test" style notices that pages hand-roll.
export function Callout({
  tone = 'info',
  icon: Icon,
  title,
  children,
  className,
}: {
  tone?: CalloutTone
  icon?: LucideIcon
  title?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex gap-3 rounded-lg border p-4 text-sm', toneClasses[tone], className)}>
      {Icon && <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconTone[tone])} />}
      <div className="min-w-0 space-y-1">
        {title && <p className={cn('font-semibold', iconTone[tone])}>{title}</p>}
        {children && <div className="text-foreground/90">{children}</div>}
      </div>
    </div>
  )
}
