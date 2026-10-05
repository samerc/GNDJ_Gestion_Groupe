// « Ce qui va se passer » — shown inside the confirm dialog of a big one-shot action (Envoyer les réponses, Publier le
// passage). Renders the server's preview: the numbers (with an optional per-unit detail), the warnings worth a look,
// and the blockers (then the caller disables the confirm button). Data comes from the action's /preview endpoint.
import { AlertTriangle, Ban } from 'lucide-react'
import { Callout } from '@/components/shared/callout'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'

export interface ActionPreviewLine { label: string; count: number; detail?: string | null }
export interface ActionPreview { lines: ActionPreviewLine[]; warnings: string[]; blockers: string[] }

export function ActionPreviewPanel({ data, isLoading, error }: { data?: ActionPreview; isLoading: boolean; error?: unknown }) {
  if (isLoading) return <LoadingSpinner />
  if (error) return <Callout tone="danger" icon={Ban}>{parseApiError(error)}</Callout>
  if (!data) return null

  return (
    <div className="space-y-3">
      {data.blockers.length > 0 && (
        <Callout tone="danger" icon={Ban} title="Impossible pour le moment">
          <ul className="list-disc space-y-0.5 pl-4">{data.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </Callout>
      )}
      <div>
        <p className="mb-1.5 text-sm font-semibold">Ce qui va se passer</p>
        <ul className="divide-y rounded-lg border">
          {data.lines.map((l) => (
            <li key={l.label} className="flex items-start gap-3 px-3 py-2 text-sm">
              <span className="w-12 shrink-0 text-right text-base font-semibold tabular-nums">{l.count}</span>
              <span className="min-w-0">
                {l.label}
                {l.detail && <span className="block break-words text-xs text-muted-foreground">{l.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {data.warnings.length > 0 && (
        <Callout tone="warning" icon={AlertTriangle} title="À vérifier">
          <ul className="list-disc space-y-0.5 pl-4">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Callout>
      )}
    </div>
  )
}
