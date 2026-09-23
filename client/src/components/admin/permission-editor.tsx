// Shared permission editors — one place, one vocabulary. Used across the "Accès & permissions" hub so a
// permission is always presented the same way:
//   • PermissionGroups — the RAW editor (every permission as a checkbox, grouped by domain) for editing a
//     security profile's full capability set. Data-driven from the backend catalog (single source of truth,
//     so it always covers every grantable permission — including ones the old hard-coded list forgot).
//   • AreaLevels — the DOMAINE editor (Aucun / Lecture / Complet per delegable area) for per-function access
//     and per-member delegation.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePermissionCatalog, type PermCatalogPerm } from '@/services/permission-service'

// Raw permission editor: every permission as a checkbox, grouped by domain, each domain with a master
// (indeterminate-aware) checkbox. Controlled — `value` = the granted permission keys, `onChange` = the next set.
export function PermissionGroups({ value, onChange, disabled }: {
  value: Set<string>; onChange: (next: Set<string>) => void; disabled?: boolean
}) {
  const { data } = usePermissionCatalog()
  if (!data) return null
  const byDomain = data.domains
    .map(d => ({ ...d, perms: data.permissions.filter(p => p.domainKey === d.key) }))
    .filter(d => d.perms.length > 0)

  const togglePerm = (key: string) => {
    const n = new Set(value)
    if (n.has(key)) n.delete(key); else n.add(key)
    onChange(n)
  }
  // Domain master checkbox: if every child is on, clear them all; otherwise turn them all on.
  const toggleDomain = (perms: PermCatalogPerm[]) => {
    const n = new Set(value)
    const all = perms.every(p => n.has(p.key))
    for (const p of perms) { if (all) n.delete(p.key); else n.add(p.key) }
    onChange(n)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {byDomain.map(d => {
        const checked = d.perms.filter(p => value.has(p.key)).length
        const all = checked === d.perms.length
        const some = checked > 0 && !all
        return (
          <div key={d.key} className="rounded-md border p-3">
            <label className="mb-2 flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={all} ref={el => { if (el) el.indeterminate = some }}
                onChange={() => toggleDomain(d.perms)} disabled={disabled} className="rounded" />
              <span className="text-sm font-medium">{d.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{checked}/{d.perms.length}</span>
            </label>
            <div className="space-y-1 pl-5">
              {d.perms.map(p => (
                <label key={p.key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={value.has(p.key)} onChange={() => togglePerm(p.key)}
                    disabled={disabled} className="rounded" />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const AREA_LEVELS = [
  { value: 'aucun', label: 'Aucun' },
  { value: 'lecture', label: 'Lecture' },
  { value: 'complet', label: 'Complet' },
]

// Domaine access editor: Aucun / Lecture / Complet per delegable area — the same widget for per-function
// access (Fonctions) and per-member delegation (Membres).
export function AreaLevels({ areas, levels, onChange, disabled, columns = 'sm:grid-cols-2 xl:grid-cols-3' }: {
  areas: { key: string; label: string }[]
  levels: Record<string, string>
  onChange: (key: string, value: string) => void
  disabled?: boolean
  columns?: string
}) {
  return (
    <div className={`grid gap-x-6 gap-y-3 ${columns}`}>
      {areas.map(a => (
        <div key={a.key} className="flex items-center justify-between gap-2">
          <span className="text-sm">{a.label}</span>
          <Select value={levels[a.key] ?? 'aucun'} onValueChange={v => onChange(a.key, v)} disabled={disabled}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AREA_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}
