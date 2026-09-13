import { useState } from 'react'
import { Plus, Trash2, Megaphone, CalendarClock, Pencil, Check } from 'lucide-react'
import { useSetting, useUpdateSetting } from '@/services/settings-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

// One scheduled banner. start/end are 'yyyy-MM-dd' or '' (no bound).
interface Msg { text: string; start: string; end: string }

// Editor for a "login.*_messages" json setting: a LIST of announcement banners, each with its own optional
// start/end display window. Messages are READ-ONLY by default (a summary card); click "Modifier" to edit one
// inline. Adding/removing/editing marks the list dirty; the whole array is persisted with the footer "Enregistrer".
// Self-contained — the setting is CG-editable (category "login") via the standard PUT /settings/{key}.
export function LoginMessagesEditor({ settingKey }: { settingKey: string }) {
  const { data: setting, isLoading } = useSetting(settingKey)
  const update = useUpdateSetting()
  const [rows, setRows] = useState<Msg[]>([])
  const [loaded, setLoaded] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [editing, setEditing] = useState<number | null>(null) // index of the row open for editing

  // Parse the stored json into rows on first load / whenever the server value changes (e.g. after a save the
  // query refetches). Render-phase reset — React's derive-from-props pattern keyed on the raw value string.
  if (setting && setting.value !== loaded) {
    setLoaded(setting.value)
    setRows(parse(setting.value))
    setDirty(false)
    setEditing(null)
  }

  const edit = (i: number, patch: Partial<Msg>) => { setRows((r) => r.map((m, j) => (j === i ? { ...m, ...patch } : m))); setDirty(true) }
  const addRow = () => { setEditing(rows.length); setRows((r) => [...r, { text: '', start: '', end: '' }]); setDirty(true) }
  const removeRow = (i: number) => {
    setRows((r) => r.filter((_, j) => j !== i)); setDirty(true)
    // Keep the "currently editing" pointer valid as indices shift.
    setEditing((e) => (e === null ? null : e === i ? null : e > i ? e - 1 : e))
  }

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
    <div className="space-y-4">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
          <Megaphone className="h-6 w-6 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">Aucun message programmé pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((m, i) => (editing === i
            ? <EditRow key={i} m={m} onChange={(p) => edit(i, p)} onRemove={() => removeRow(i)} onDone={() => setEditing(null)} />
            : <ViewRow key={i} m={m} onEdit={() => setEditing(i)} onRemove={() => removeRow(i)} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus className="mr-1.5 h-4 w-4" />Ajouter un message</Button>
        <Button type="button" size="sm" onClick={save} disabled={!dirty || update.isPending}>
          <Check className="mr-1.5 h-4 w-4" />{update.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        {dirty && <span className="text-xs font-medium text-amber-600">Modifications non enregistrées</span>}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Chaque message s'affiche entre sa date de début (vide = immédiatement) et sa date de fin (vide = jusqu'à sa suppression).
        Plusieurs messages actifs s'affichent l'un sous l'autre sur l'écran de connexion.
      </p>
    </div>
  )
}

// Read-only summary of a message (default state): text + schedule + status, with Modifier / Supprimer.
function ViewRow({ m, onEdit, onRemove }: { m: Msg; onEdit: () => void; onRemove: () => void }) {
  const st = status(m)
  return (
    <div className="group flex items-start gap-3 rounded-lg border bg-card p-4 shadow-2xs transition-colors hover:border-primary/30">
      <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap break-words text-sm">
          {m.text.trim() || <span className="italic text-muted-foreground">(message vide)</span>}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />{scheduleLabel(m)}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Modifier" aria-label="Modifier ce message">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onRemove} title="Supprimer" aria-label="Supprimer ce message">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// Inline edit form for one message: text + start/end pickers + live status. "Terminer" collapses back to the
// summary (changes are kept in the list and persisted by the footer "Enregistrer").
function EditRow({ m, onChange, onRemove, onDone }: { m: Msg; onChange: (p: Partial<Msg>) => void; onRemove: () => void; onDone: () => void }) {
  const st = status(m)
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-2xs">
      <div className="flex items-start gap-3">
        <Megaphone className="mt-2 h-4 w-4 shrink-0 text-primary" />
        <textarea
          autoFocus
          value={m.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Texte du message affiché sur l'écran de connexion…"
          rows={2}
          className="flex min-h-[3.5rem] w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove} title="Supprimer" aria-label="Supprimer ce message">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-4 pl-7">
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block font-medium">Début <span className="font-normal text-muted-foreground/70">(optionnel)</span></span>
          <Input type="date" value={m.start} onChange={(e) => onChange({ start: e.target.value })} className="h-9 max-w-[10rem]" />
        </label>
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block font-medium">Fin <span className="font-normal text-muted-foreground/70">(optionnel)</span></span>
          <Input type="date" value={m.end} onChange={(e) => onChange({ end: e.target.value })} className="h-9 max-w-[10rem]" />
        </label>
        <span className={`inline-flex items-center gap-1 self-center rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
          <CalendarClock className="h-3 w-3" />{st.label}
        </span>
      </div>
      <div className="pl-7">
        <Button type="button" variant="outline" size="sm" onClick={onDone}><Check className="mr-1.5 h-4 w-4" />Terminer</Button>
      </div>
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

// A plain-French summary of the display window shown on the read-only card.
function scheduleLabel(m: Msg): string {
  if (m.start && m.end) return `Du ${fr(m.start)} au ${fr(m.end)}`
  if (m.start) return `À partir du ${fr(m.start)}`
  if (m.end) return `Jusqu'au ${fr(m.end)}`
  return 'Toujours affiché'
}

// Live status chip — mirrors the server's inclusive [start, end] window (browser date; the server is authoritative).
function status(m: Msg): { label: string; cls: string } {
  const today = new Date().toISOString().slice(0, 10)
  if (m.end && m.end < today) return { label: 'Expiré', cls: 'bg-muted text-muted-foreground' }
  if (m.start && m.start > today) return { label: 'Programmé', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'Actif', cls: 'bg-emerald-100 text-emerald-700' }
}
