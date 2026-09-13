import { useState } from 'react'
import { Plus, Trash2, Megaphone, CalendarClock } from 'lucide-react'
import { useSetting, useUpdateSetting } from '@/services/settings-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

// One scheduled banner. start/end are 'yyyy-MM-dd' or '' (no bound).
interface Msg { text: string; start: string; end: string }

// Editor for a "login.*_messages" json setting: a LIST of announcement banners, each with its own optional
// start/end display window. Replaces the old single-message + start + end trio. Parses the json array, lets the
// CG add/remove/edit rows, and saves the whole array. Each row shows a live status chip (actif / programmé /
// expiré) so it's clear what will actually appear. Self-contained (own Save button) — the setting is CG-editable
// (category "login") via the standard PUT /settings/{key}.
export function LoginMessagesEditor({ settingKey }: { settingKey: string }) {
  const { data: setting, isLoading } = useSetting(settingKey)
  const update = useUpdateSetting()
  const [rows, setRows] = useState<Msg[]>([])
  const [loaded, setLoaded] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // Parse the stored json into rows on first load / whenever the server value changes (e.g. after a save the
  // query refetches). Render-phase reset — React's derive-from-props pattern keyed on the raw value string.
  if (setting && setting.value !== loaded) {
    setLoaded(setting.value)
    setRows(parse(setting.value))
    setDirty(false)
  }

  const edit = (i: number, patch: Partial<Msg>) => { setRows((r) => r.map((m, j) => (j === i ? { ...m, ...patch } : m))); setDirty(true) }
  const addRow = () => { setRows((r) => [...r, { text: '', start: '', end: '' }]); setDirty(true) }
  const removeRow = (i: number) => { setRows((r) => r.filter((_, j) => j !== i)); setDirty(true) }

  const save = async () => {
    // Drop empty-text rows; store empty dates as null.
    const clean = rows.map((r) => ({ text: r.text.trim(), start: r.start || null, end: r.end || null })).filter((r) => r.text)
    try {
      await update.mutateAsync({ key: settingKey, value: JSON.stringify(clean) })
      toast.success(clean.length ? 'Messages enregistrés' : 'Aucun message — bannière masquée')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
          Aucun message. Cliquez sur « Ajouter un message » pour en programmer un.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((m, i) => {
            const st = status(m)
            return (
              <div key={i} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-start gap-2">
                  <Megaphone className="mt-2 h-4 w-4 shrink-0 text-primary" />
                  <textarea
                    value={m.text}
                    onChange={(e) => edit(i, { text: e.target.value })}
                    placeholder="Texte du message affiché sur l'écran de connexion…"
                    rows={2}
                    className="flex min-h-[3.5rem] w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(i)} title="Supprimer ce message" aria-label="Supprimer ce message">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-end gap-3 pl-6">
                  <label className="text-xs text-muted-foreground">
                    <span className="mb-1 block">Début <span className="text-muted-foreground/70">(optionnel)</span></span>
                    <Input type="date" value={m.start} onChange={(e) => edit(i, { start: e.target.value })} className="h-8 max-w-[10rem]" />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    <span className="mb-1 block">Fin <span className="text-muted-foreground/70">(optionnel)</span></span>
                    <Input type="date" value={m.end} onChange={(e) => edit(i, { end: e.target.value })} className="h-8 max-w-[10rem]" />
                  </label>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${st.cls}`}>
                    <CalendarClock className="h-3 w-3" />{st.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus className="mr-1 h-4 w-4" />Ajouter un message</Button>
        <Button type="button" size="sm" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        {dirty && <span className="text-xs text-amber-600">Modifications non enregistrées</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Chaque message s'affiche entre sa date de début (vide = immédiatement) et sa date de fin (vide = jusqu'à sa suppression). Plusieurs messages actifs s'affichent l'un sous l'autre.
      </p>
    </div>
  )
}

// Parse the stored json array into editable rows (tolerant of missing/null fields + malformed json).
function parse(raw: string): Msg[] {
  if (!raw?.trim()) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({ text: String(x.text ?? ''), start: String(x.start ?? '') || '', end: String(x.end ?? '') || '' }))
  } catch { return [] }
}

const fr = (d: string) => { const [y, m, day] = d.split('-'); return day && m && y ? `${day}/${m}/${y}` : d }

// Live status chip — mirrors the server's inclusive [start, end] window (browser date; the server is authoritative).
function status(m: Msg): { label: string; cls: string } {
  const today = new Date().toISOString().slice(0, 10)
  if (m.end && m.end < today) return { label: `Expiré le ${fr(m.end)}`, cls: 'bg-muted text-muted-foreground' }
  if (m.start && m.start > today) return { label: `Programmé le ${fr(m.start)}`, cls: 'bg-amber-100 text-amber-700' }
  return { label: m.end ? `Actif jusqu'au ${fr(m.end)}` : 'Actif', cls: 'bg-emerald-100 text-emerald-700' }
}
