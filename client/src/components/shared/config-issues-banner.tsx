// Lists configuration problems (settings that contradict each other, email templates with unknown {{variables}}).
// Errors first (red), then warnings (amber). Each line can open the Paramètres tab where it's fixed: via onOpenTab
// when already on the Paramètres page, else a link (a tab starting with "/" is a page path, e.g. Suivi documents). Renders nothing when there's no issue.
import { Link } from 'react-router'
import { AlertTriangle, XCircle } from 'lucide-react'
import type { ConfigIssue } from '@/services/system-service'
import { cn } from '@/lib/utils'

interface Props {
  issues: ConfigIssue[] | undefined
  title?: string
  onOpenTab?: (tab: string) => void
  showFix?: boolean // false when already on the page where it's fixed
  className?: string
}

export function ConfigIssuesBanner({ issues, title = 'Points à vérifier dans la configuration', onOpenTab, showFix = true, className }: Props) {
  if (!issues || issues.length === 0) return null
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  const hasError = sorted.some((i) => i.severity === 'error')

  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border p-3 text-sm',
        hasError
          ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
          : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
        className,
      )}
    >
      <p className="mb-2 font-medium">{title}</p>
      <ul className="space-y-1.5">
        {sorted.map((i, idx) => (
          <li key={idx} className="flex items-start gap-2">
            {i.severity === 'error'
              ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />}
            <span className="min-w-0 flex-1">
              {i.message}
              {showFix && i.tab && (i.tab.startsWith('/')
                ? <Link to={i.tab} className="ml-2 text-primary underline-offset-2 hover:underline">Corriger</Link>
                : onOpenTab
                ? <button type="button" onClick={() => onOpenTab(i.tab!)} className="ml-2 text-primary underline-offset-2 hover:underline">Corriger</button>
                : <Link to={`/admin/settings?tab=${encodeURIComponent(i.tab)}`} className="ml-2 text-primary underline-offset-2 hover:underline">Corriger</Link>)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
