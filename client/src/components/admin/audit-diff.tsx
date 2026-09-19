// The before→after diff table for an audit snapshot (its own file so audit-format.ts can stay a pure
// non-component module — the react-refresh rule wants component files to export only components).
import { formatVal, fieldLabel } from '@/lib/audit-format'

function parseObj(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    const o = JSON.parse(json)
    return typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : null
  } catch { return null }
}

// Combined before→after view. When both snapshots exist it shows one row per field with the old and new value
// side by side, HIGHLIGHTING the ones that actually changed. When only one side exists (Create / Delete) it shows
// a single value column.
export function DiffViewer({ oldJson, newJson }: { oldJson: string | null; newJson: string | null }) {
  const oldObj = parseObj(oldJson)
  const newObj = parseObj(newJson)

  if (!oldObj && !newObj) {
    const raw = newJson ?? oldJson
    if (!raw) return <span className="text-muted-foreground">—</span>
    return <pre className="rounded-md bg-muted/30 p-3 text-xs overflow-auto whitespace-pre-wrap">{raw}</pre>
  }

  const keys = Array.from(new Set([...Object.keys(oldObj ?? {}), ...Object.keys(newObj ?? {})]))
  const both = oldObj && newObj

  return (
    <div className="rounded-md border text-sm overflow-hidden">
      <div className={`grid ${both ? 'grid-cols-[6rem_1fr_1fr] sm:grid-cols-[10rem_1fr_1fr]' : 'grid-cols-[6rem_1fr] sm:grid-cols-[10rem_1fr]'} bg-muted/50 font-medium text-muted-foreground text-xs uppercase`}>
        <div className="px-3 py-1.5">Champ</div>
        {both ? <><div className="px-3 py-1.5">Avant</div><div className="px-3 py-1.5">Après</div></> : <div className="px-3 py-1.5">Valeur</div>}
      </div>
      <div className="divide-y">
        {keys.map((k) => {
          const ov = oldObj?.[k]
          const nv = newObj?.[k]
          const changed = both && formatVal(ov) !== formatVal(nv)
          return (
            <div key={k} className={`grid ${both ? 'grid-cols-[6rem_1fr_1fr] sm:grid-cols-[10rem_1fr_1fr]' : 'grid-cols-[6rem_1fr] sm:grid-cols-[10rem_1fr]'} ${changed ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
              <div className="px-3 py-1.5 font-medium text-muted-foreground">{fieldLabel(k)}</div>
              {both ? (
                <>
                  <div className={`px-3 py-1.5 break-all ${changed ? 'text-muted-foreground line-through' : ''}`}>{formatVal(ov)}</div>
                  <div className={`px-3 py-1.5 break-all ${changed ? 'font-medium text-amber-800 dark:text-amber-300' : ''}`}>{formatVal(nv)}</div>
                </>
              ) : (
                <div className="px-3 py-1.5 break-all">{formatVal(oldObj ? ov : nv)}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
