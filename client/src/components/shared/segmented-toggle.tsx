import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SegOption<T extends string> {
  value: T
  label: React.ReactNode
  icon?: LucideIcon
}

// Compact segmented control (e.g. Actifs / Anciens, Toutes / Mes tâches, Membres / Inscription). Replaces the
// ad-hoc styled <button> rows that were re-implemented, slightly differently, on several pages. The active
// segment is a raised card chip; the rest are muted.
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  size = 'default',
  className,
}: {
  options: SegOption<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'default'
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border border-input bg-muted/40 p-0.5',
        className,
      )}
      role="group"
    >
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              active
                ? 'bg-card text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
