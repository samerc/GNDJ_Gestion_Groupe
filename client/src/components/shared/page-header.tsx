import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  /** Optional custom leading visual (e.g. a member photo) shown INSTEAD of the icon tile. */
  avatar?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

// Standard page title block: a tinted accent icon tile (or a custom `avatar`), a consistent h1
// (size/weight/tracking), an optional subtitle, a right-aligned actions cluster, and a hairline divider that
// visually separates the header from the page body. Use on every top-level page so the header treatment
// never drifts page to page.
// On a phone: no icon tile (the avatar, e.g. an editable photo, stays) (it eats a fifth of the width), the title wraps instead of being cut with "…",
// the subtitle is kept to two lines, and the actions take the full width.
export function PageHeader({ title, description, icon: Icon, avatar, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {avatar ? (
          <span className="shrink-0">{avatar}</span>
        ) : Icon ? (
          <span className="hidden h-11 w-11 shrink-0 sm:flex items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0 space-y-0.5">
          <h1 className="break-words text-xl font-semibold tracking-tight sm:truncate sm:text-2xl">{title}</h1>
          {description && <p className="line-clamp-2 text-sm text-muted-foreground sm:line-clamp-none">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  )
}
