import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Megaphone, CalendarClock, Pencil, Check } from 'lucide-react'
import { useSetting, useUpdateSetting } from '@/services/settings-service'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tip } from '@/components/ui/tooltip'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { DateInput } from '@/components/shared/date-input'
import { confirmAsync } from '@/lib/confirm'
import { formatDate } from '@/lib/utils'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

// One scheduled banner. start/end are 'yyyy-MM-dd' or '' (no bound).
interface Msg { text: string; start: string; end: string }

// Editor for a "login.*_messages" json setting: a LIST of announcement banners, each with its own optional
// start/end display window. Messages are READ-ONLY by default (a summary card); click "Modifier" to edit one
// inline. Every change AUTO-SAVES: finishing a message ("Enregistrer" on the row) or removing one persists the
// whole array immediately, and a safety net saves any pending edit if you navigate away — so a message is never
// silently lost (there is no separate footer "save" step to forget). CG-editable (category "login") via PUT /settings/{key}.
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

  // Persist a given list to the server (defaults to the current rows). Empty-text rows are dropped, empty dates
  // stored as null. Called on every commit — the collapse-to-summary is a real save, not just a visual "done".
  const persist = async (list: Msg[]) => {
    const clean = list.map((r) => ({ text: r.text.trim(), start: r.start || null, end: r.end || null })).filter((r) => r.text)
    try {
      await update.mutateAsync({ key: settingKey, value: JSON.stringify(clean) })
      setDirty(false)
      toast.success(clean.length ? 'Messages enregistrés' : 'Aucun message — bannière masquée')
    } catch (e) { toast.error(parseApiError(e)) }
  }

  // Safety net: if the user leaves the page while a message still has unsaved edits (e.g. they typed but didn't
  // click "Enregistrer" on the row), persist it on unmount so nothing is silently dropped. A ref keeps the latest
  // rows/dirty so the unmount cleanup (which runs once) sees the current state, not a stale snapshot.
  const pending = useRef<{ rows: Msg[]; dirty: boolean }>({ rows, dirty })
  useEffect(() => { pending.current = { rows, dirty } })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (pending.current.dirty) void persist(pending.current.rows) }, [])

  const edit = (i: number, patch: Partial<Msg>) => { setRows((r) => r.map((m, j) => (j === i ? { ...m, ...patch } : m))); setDirty(true) }
  const addRow = () => { setEditing(rows.length); setRows((r) => [...r, { text: '', start: '', end: '' }]); setDirty(true) }
  // Finishing a message saves it right away and collapses to the summary card.
  const commitRow = () => { setEditing(null); void persist(rows) }
  const removeRow = async (i: number) => {
    // A saved message asks first; a blank row that was just added goes away without a prompt.
    if (rows[i]?.text.trim() && !(await confirmAsync({
      title: 'Supprimer le message ?',
      description: "Il ne s'affichera plus sur l'écran de connexion.",
      confirmLabel: 'Supprimer',
      destructive: true,
    }))) return
    const next = rows.filter((_, j) => j !== i)
    setRows(next); setDirty(true)
    // Keep the "currently editing" pointer valid as indices shift.
    setEditing((e) => (e === null ? null : e === i ? null : e > i ? e - 1 : e))
    void persist(next) // removal is immediate — persist the new list
  }

  if (isLoading) return <LoadingSpinner variant="table" />

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <EmptyState icon={Megaphone} title="Aucun message programmé" description="Ajoutez un message pour l'afficher sur l'écran de connexion." />
      ) : (
        <div className="space-y-3">
          {rows.map((m, i) => (editing === i
            ? <EditRow key={i} m={m} saving={update.isPending} onChange={(p) => edit(i, p)} onRemove={() => void removeRow(i)} onDone={commitRow} />
            : <ViewRow key={i} m={m} onEdit={() => setEditing(i)} onRemove={() => void removeRow(i)} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={update.isPending}><Plus className="mr-1.5 h-4 w-4" />Ajouter un message</Button>
        {update.isPending && <span className="text-xs font-medium text-muted-foreground">Enregistrement…</span>}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Chaque message est enregistré automatiquement. Il s'affiche entre sa date de début (vide = immédiatement) et sa
        date de fin (vide = jusqu'à sa suppression). Plusieurs messages actifs s'affichent l'un sous l'autre sur l'écran de connexion.
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
          <Badge variant={st.variant}>{st.label}</Badge>
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5">
        <Tip content="Modifier le message">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Modifier le message">
            <Pencil className="h-4 w-4" />
          </Button>
        </Tip>
        <Tip content="Supprimer le message">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label="Supprimer le message">
            <Trash2 className="h-4 w-4" />
          </Button>
        </Tip>
      </div>
    </div>
  )
}

// Inline edit form for one message: text + start/end pickers + live status. "Enregistrer" saves this message
// (persists the whole list) and collapses back to the summary card — there is no separate save step to forget.
function EditRow({ m, saving, onChange, onRemove, onDone }: { m: Msg; saving: boolean; onChange: (p: Partial<Msg>) => void; onRemove: () => void; onDone: () => void }) {
  const st = status(m)
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-2xs">
      <div className="flex items-start gap-3">
        <Megaphone className="mt-2 h-4 w-4 shrink-0 text-primary" />
        <Textarea
          autoFocus
          value={m.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Texte du message affiché sur l'écran de connexion…"
          rows={2}
          className="min-h-[3.5rem] flex-1"
        />
        <Tip content="Supprimer le message">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label="Supprimer le message">
            <Trash2 className="h-4 w-4" />
          </Button>
        </Tip>
      </div>
      <div className="flex flex-wrap items-end gap-4 pl-7">
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block font-medium">Début <span className="font-normal text-muted-foreground/70">(optionnel)</span></span>
          <DateInput value={m.start} onChange={(v) => onChange({ start: v ?? '' })} className="h-9 max-w-[10rem]" />
        </label>
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block font-medium">Fin <span className="font-normal text-muted-foreground/70">(optionnel)</span></span>
          <DateInput value={m.end} onChange={(v) => onChange({ end: v ?? '' })} className="h-9 max-w-[10rem]" />
        </label>
        <Badge variant={st.variant} className="gap-1 self-center">
          <CalendarClock className="h-3 w-3" />{st.label}
        </Badge>
      </div>
      <div className="pl-7">
        <Button type="button" size="sm" onClick={onDone} disabled={saving}>
          <Check className="mr-1.5 h-4 w-4" />{saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
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

const fr = (d: string) => formatDate(d)

// A plain-French summary of the display window shown on the read-only card.
function scheduleLabel(m: Msg): string {
  if (m.start && m.end) return `Du ${fr(m.start)} au ${fr(m.end)}`
  if (m.start) return `À partir du ${fr(m.start)}`
  if (m.end) return `Jusqu'au ${fr(m.end)}`
  return 'Toujours affiché'
}

// Live status chip — mirrors the server's inclusive [start, end] window (browser date; the server is authoritative).
function status(m: Msg): { label: string; variant: 'secondary' | 'warning' | 'success' } {
  const today = new Date().toISOString().slice(0, 10)
  if (m.end && m.end < today) return { label: 'Expiré', variant: 'secondary' }
  if (m.start && m.start > today) return { label: 'Programmé', variant: 'warning' }
  return { label: 'Actif', variant: 'success' }
}
