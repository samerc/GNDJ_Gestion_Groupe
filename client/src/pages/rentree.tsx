import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import {
  useRentreeYears, useRentreeTasks, useCompleteRentreeTask, useGenerateRentree,
  useUpdateRentreeTask, useDeleteRentreeTask, type RentreeTask,
} from '@/services/rentree-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { RequiredLabel } from '@/components/shared/required-label'
import { cn } from '@/lib/utils'
import { parseApiError } from '@/lib/error-utils'
import { Check, Lock, CalendarClock, Users, Settings2, Sparkles, Pencil, Trash2, ListChecks, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

const ROLE_LABELS: Record<string, string> = {
  'chef-de-groupe': 'Chef de Groupe', 'chef-unite': "Chef d'unité", 'assistant-de-groupe': 'Assistant de Groupe',
  'chef-equipe': "Chef d'équipe", 'read-only': 'Membre',
}
const roleLabel = (r: string | null) => ROLE_LABELS[r ?? ''] ?? r ?? '—'

// Round check / lock indicator shared by single and per-unit rows.
function CheckDot({ task, canManage, onToggle }: { task: RentreeTask; canManage: boolean; onToggle: (t: RentreeTask) => void }) {
  const done = task.status === 'done'
  const canTick = (task.isMine || canManage) && !task.isBlocked
  return (
    <button type="button" disabled={!canTick} onClick={() => onToggle(task)}
      title={task.isBlocked ? 'Bloquée par une tâche préalable' : done ? 'Rouvrir' : 'Marquer terminée'}
      className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
        done ? 'border-emerald-500 bg-emerald-500 text-white'
          : task.isBlocked ? 'border-muted-foreground/30 cursor-not-allowed'
          : 'border-muted-foreground/40 hover:border-primary cursor-pointer')}>
      {done ? <Check className="h-3 w-3" /> : task.isBlocked ? <Lock className="h-2.5 w-2.5 text-muted-foreground" /> : null}
    </button>
  )
}

function Deadline({ task }: { task: RentreeTask }) {
  if (!task.deadlineLabel && !task.dueDate) return null
  return (
    <span className={cn('inline-flex items-center gap-1', task.isOverdue && 'font-medium text-destructive')}>
      <CalendarClock className="h-3 w-3" />
      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR') : task.deadlineLabel}
      {task.isOverdue && ' — en retard'}
    </span>
  )
}

// A single (group-level) task, or one per-unit row inside a rollup (compact).
function TaskRow({ task, canManage, compact, onToggle, onEdit, onDelete }: {
  task: RentreeTask; canManage: boolean; compact?: boolean
  onToggle: (t: RentreeTask) => void; onEdit: (t: RentreeTask) => void; onDelete: (t: RentreeTask) => void
}) {
  const done = task.status === 'done'
  const assignee = compact
    ? (task.unitName ?? '') + (task.assigneeNames.length ? ` — ${task.assigneeNames.join(', ')}` : '')
    : task.assigneeNames.length > 0 ? task.assigneeNames.join(', ') : roleLabel(task.assigneeRole)

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-3 transition-colors',
      compact && 'border-0 border-b last:border-b-0 rounded-none py-2 pl-2',
      done ? 'bg-muted/40' : task.isBlocked ? 'opacity-70' : 'bg-background',
      !compact && task.isMine && !done && 'border-l-2 border-l-primary')}>
      <CheckDot task={task} canManage={canManage} onToggle={onToggle} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium leading-snug', done && 'text-muted-foreground line-through')}>
          {compact ? assignee : task.title}
        </p>
        {!compact && task.description && <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {!compact && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{assignee}</span>}
          <Deadline task={task} />
          {task.isBlocked && <span className="inline-flex items-center gap-1 text-amber-600"><Lock className="h-3 w-3" />En attente : {task.blockedByTitles.join(', ')}</span>}
          {done && task.completedByName && <span className="text-emerald-600">✓ {task.completedByName}</span>}
        </div>
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(task)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(task)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  )
}

type Rollup = { kind: 'rollup'; key: string; title: string; description: string | null; sample: RentreeTask; units: RentreeTask[]; done: number; blocked: number }
type Item = { kind: 'single'; task: RentreeTask } | Rollup

// One collapsed row standing in for a per-unit task across all units.
function RollupRow({ r, expanded, onExpand, canManage, onToggle, onEdit, onDelete }: {
  r: Rollup; expanded: boolean; onExpand: () => void; canManage: boolean
  onToggle: (t: RentreeTask) => void; onEdit: (t: RentreeTask) => void; onDelete: (t: RentreeTask) => void
}) {
  const total = r.units.length
  const allDone = r.done === total
  const pct = total ? Math.round((r.done / total) * 100) : 0
  return (
    <div className="rounded-lg border">
      <button type="button" onClick={onExpand} className="flex w-full items-center gap-3 p-3 text-left">
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium leading-snug', allDone && 'text-muted-foreground')}>{r.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{roleLabel(r.sample.assigneeRole)} · par unité</span>
            <Deadline task={r.sample} />
            {r.blocked > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><Lock className="h-3 w-3" />{r.blocked} en attente</span>}
          </div>
        </div>
        <div className="flex w-32 shrink-0 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', allDone ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} /></div>
          <span className={cn('w-12 text-right text-xs tabular-nums', allDone ? 'text-emerald-600' : 'text-muted-foreground')}>{r.done}/{total}</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t bg-muted/20 px-2 pb-1">
          {r.units.map(u => <TaskRow key={u.id} task={u} canManage={canManage} compact onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  )
}

export default function RentreePage() {
  const { user, hasPermission } = useAuthStore()
  const canManage = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.RENTREE_MANAGE)

  const { data: years, isLoading: yearsLoading } = useRentreeYears()
  const [year, setYear] = useState<string>('')
  const [mineOnly, setMineOnly] = useState(false)
  const [unitFilter, setUnitFilter] = useState<string>('all')
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [expandedRollups, setExpandedRollups] = useState<Set<string>>(new Set())

  useEffect(() => { if (!year && years && years.length > 0) setYear(years[0]) }, [years, year])

  const { data: tasks, isLoading } = useRentreeTasks(year || undefined, mineOnly)
  const complete = useCompleteRentreeTask()
  const generate = useGenerateRentree()
  const updateTask = useUpdateRentreeTask()
  const deleteTask = useDeleteRentreeTask()

  const [genOpen, setGenOpen] = useState(false)
  const [genYear, setGenYear] = useState('2026-2027')
  const [editing, setEditing] = useState<RentreeTask | null>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', deadlineLabel: '', dueDate: '' })
  const [deleting, setDeleting] = useState<RentreeTask | null>(null)

  // Units present in this year's per-unit tasks (for the filter).
  const units = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tasks ?? []) if (t.unitId && t.unitName) m.set(t.unitId, t.unitName)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [tasks])

  const rollupMode = !mineOnly && unitFilter === 'all'

  // Build phase → items, rolling up per-unit tasks when in rollup mode.
  const phases = useMemo(() => {
    let source = tasks ?? []
    if (!mineOnly && unitFilter !== 'all') source = source.filter(t => t.unitId === unitFilter)

    const order: string[] = []
    const byPhase = new Map<string, RentreeTask[]>()
    for (const t of source) { if (!byPhase.has(t.phase)) { byPhase.set(t.phase, []); order.push(t.phase) } byPhase.get(t.phase)!.push(t) }

    return order.map(phase => {
      const phaseTasks = byPhase.get(phase)!
      let items: Item[]
      if (rollupMode) {
        const groups = new Map<string, RentreeTask[]>()
        const gorder: string[] = []
        for (const t of phaseTasks) {
          const key = t.unitId ? (t.templateId ?? t.id) : t.id
          if (!groups.has(key)) { groups.set(key, []); gorder.push(key) }
          groups.get(key)!.push(t)
        }
        items = gorder.map(key => {
          const ts = groups.get(key)!
          if (!ts[0].unitId) return { kind: 'single', task: ts[0] }
          return {
            kind: 'rollup', key, title: ts[0].title, description: ts[0].description, sample: ts[0], units: ts,
            done: ts.filter(t => t.status === 'done').length, blocked: ts.filter(t => t.isBlocked).length,
          }
        })
      } else {
        items = phaseTasks.map(t => ({ kind: 'single', task: t }))
      }
      const total = items.length
      const done = items.filter(it => it.kind === 'single' ? it.task.status === 'done' : it.done === it.units.length).length
      return { phase, items, done, total }
    })
  }, [tasks, mineOnly, unitFilter, rollupMode])

  const total = tasks?.length ?? 0
  const doneCount = tasks?.filter(t => t.status === 'done').length ?? 0
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const toggle = async (t: RentreeTask) => {
    try { await complete.mutateAsync({ id: t.id, done: t.status !== 'done' }) }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const openEdit = (t: RentreeTask) => {
    setEditing(t)
    setEditForm({ title: t.title, description: t.description ?? '', deadlineLabel: t.deadlineLabel ?? '', dueDate: t.dueDate ?? '' })
  }
  const saveEdit = async () => {
    if (!editing) return
    try {
      await updateTask.mutateAsync({
        id: editing.id, title: editForm.title, description: editForm.description || null,
        deadlineLabel: editForm.deadlineLabel || null, dueDate: editForm.dueDate || null,
        assigneeMemberIds: editing.assigneeMemberIds,
      })
      toast.success('Tâche modifiée'); setEditing(null)
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const doGenerate = async (overwrite: boolean) => {
    try {
      const r = await generate.mutateAsync({ scoutYear: genYear.trim(), overwrite })
      toast.success(`${r.created} tâche(s) générée(s)`); setGenOpen(false); setYear(genYear.trim())
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const togglePhase = (p: string) => setCollapsedPhases(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })
  const toggleRollup = (k: string) => setExpandedRollups(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  if (yearsLoading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>
  const noYears = !years || years.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><ListChecks className="h-5 w-5 text-primary" />Rentrée scoute</h1>
          <p className="text-sm text-muted-foreground">Les tâches du démarrage de l'année — chacun voit ce qu'il a à faire.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!noYears && (
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{years!.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {canManage && !mineOnly && units.length > 0 && (
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les unités</SelectItem>
                {units.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* Only managers (CG / super-admin) can switch to the whole-group view; everyone else only ever
              sees their own tasks (also enforced server-side). */}
          {canManage && (
            <div className="flex h-9 items-center rounded-md border p-0.5 text-xs">
              <button type="button" className={cn('h-full rounded px-2.5 font-medium', !mineOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} onClick={() => setMineOnly(false)}>Toutes</button>
              <button type="button" className={cn('h-full rounded px-2.5 font-medium', mineOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} onClick={() => setMineOnly(true)}>Mes tâches</button>
            </div>
          )}
          {canManage && (
            <>
              <Button variant="outline" size="sm" asChild><Link to="/admin/rentree-template"><Settings2 className="mr-1 h-4 w-4" />Modèle</Link></Button>
              <Button size="sm" onClick={() => setGenOpen(true)}><Sparkles className="mr-1 h-4 w-4" />Générer</Button>
            </>
          )}
        </div>
      </div>

      {noYears ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucune liste de rentrée générée.
          {canManage ? <> Cliquez sur <b>Générer</b> pour créer la liste à partir du modèle.</> : <> Revenez quand le Chef de Groupe l'aura préparée.</>}
        </div>
      ) : (
        <>
          <div className="rounded-lg border p-3">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium">{doneCount}/{total} terminée{total > 1 ? 's' : ''}{mineOnly ? ' (mes tâches)' : ''}</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
          </div>

          {isLoading ? <div className="flex h-40 items-center justify-center"><LoadingSpinner /></div> :
           total === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{mineOnly ? "Vous n'avez aucune tâche assignée." : 'Aucune tâche.'}</p> :
           phases.map(({ phase, items, done, total }) => {
            const collapsed = collapsedPhases.has(phase)
            return (
              <div key={phase} className="space-y-2">
                <button type="button" onClick={() => togglePhase(phase)} className="flex w-full items-center gap-2 text-left">
                  <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', !collapsed && 'rotate-90')} />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{phase}</h2>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', done === total ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground')}>{done}/{total} ✓</span>
                </button>
                {!collapsed && (
                  <div className="space-y-2">
                    {items.map(it => it.kind === 'single'
                      ? <TaskRow key={it.task.id} task={it.task} canManage={canManage} onToggle={toggle} onEdit={openEdit} onDelete={setDeleting} />
                      : <RollupRow key={it.key} r={it} expanded={expandedRollups.has(it.key)} onExpand={() => toggleRollup(it.key)} canManage={canManage} onToggle={toggle} onEdit={openEdit} onDelete={setDeleting} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* Generate dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Générer la liste de rentrée</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <RequiredLabel required>Année scoute</RequiredLabel>
            <Input value={genYear} onChange={e => setGenYear(e.target.value)} placeholder="2026-2027" />
            <p className="text-xs text-muted-foreground">Crée une tâche par élément du modèle. Les tâches « par unité » sont dupliquées pour chaque unité active.</p>
            {years?.includes(genYear.trim()) && <p className="text-xs text-amber-600">Une liste existe déjà pour {genYear.trim()} — la régénérer effacera la progression actuelle.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Annuler</Button>
            <Button onClick={() => doGenerate(years?.includes(genYear.trim()) ?? false)} disabled={generate.isPending}>
              {generate.isPending ? 'Génération…' : years?.includes(genYear.trim()) ? 'Régénérer' : 'Générer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit task dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier la tâche{editing?.unitName ? ` — ${editing.unitName}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><RequiredLabel required>Titre</RequiredLabel><Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="space-y-1"><RequiredLabel>Description</RequiredLabel><Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><RequiredLabel>Échéance (texte)</RequiredLabel><Input value={editForm.deadlineLabel} onChange={e => setEditForm(f => ({ ...f, deadlineLabel: e.target.value }))} placeholder="1ʳᵉ sem. octobre" /></div>
              <div className="space-y-1"><RequiredLabel>Date limite</RequiredLabel><Input type="date" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            </div>
            {editing && editing.assigneeNames.length > 0 && <p className="text-xs text-muted-foreground">Responsable(s) : {editing.assigneeNames.join(', ')}</p>}
            <p className="text-xs text-muted-foreground">Une date limite dépassée déclenche un rappel à la connexion du responsable.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={saveEdit} disabled={updateTask.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Supprimer la tâche"
        description={`Supprimer « ${deleting?.title} »${deleting?.unitName ? ` (${deleting.unitName})` : ''} de la liste ${year} ?`} confirmLabel="Supprimer" variant="destructive"
        onConfirm={async () => { if (deleting) { try { await deleteTask.mutateAsync(deleting.id); toast.success('Supprimée'); setDeleting(null) } catch (err) { toast.error(parseApiError(err)) } } }} />
    </div>
  )
}
