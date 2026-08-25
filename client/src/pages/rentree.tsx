import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import {
  useRentreeYears, useRentreeTasks, useCompleteRentreeTask, useGenerateRentree,
  useUpdateRentreeTask, useDeleteRentreeTask, useRunRentreeTaskAction, useCreateRentreeTask,
  useRefreshRentreeAssignees, type RentreeTask,
} from '@/services/rentree-service'
import { getRentreeAction, RENTREE_ACTION_OPTIONS } from '@/lib/rentree-actions'
import { RENTREE_ANCHOR_OPTIONS, anchorLabel } from '@/lib/rentree-anchors'
import { RENTREE_PROGRESS_OPTIONS } from '@/lib/rentree-progress'
import { useMembers } from '@/services/member-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { RequiredLabel } from '@/components/shared/required-label'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { parseApiError } from '@/lib/error-utils'
import { Check, Lock, CalendarClock, Users, Settings2, Sparkles, Pencil, Trash2, ListChecks, ChevronRight, Play, ArrowRight, Plus, X, Activity, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

const ROLE_LABELS: Record<string, string> = {
  'chef-de-groupe': 'Chef de Groupe', 'chef-unite': "Chef d'unité", 'assistant-de-groupe': 'Assistant de Groupe',
  'chef-equipe': "Chef d'équipe", 'read-only': 'Membre',
}
const roleLabel = (r: string | null) => ROLE_LABELS[r ?? ''] ?? r ?? '—'
// Roles offered when adding a task (assignee = a security-profile code).
const ROLES = [
  { value: 'chef-de-groupe', label: 'Chef de Groupe' },
  { value: 'chef-unite', label: "Chef d'unité" },
  { value: 'assistant-de-groupe', label: 'Assistant de Groupe' },
  { value: 'read-only', label: 'Membre' },
]
// Blank form for a one-off year task.
type AddForm = {
  title: string; description: string; phase: string
  assigneeType: string; assigneeRole: string; fanOutPerUnit: boolean
  assigneeMemberIds: string[]; assigneeMemberNames: string[]
  deadlineLabel: string; dueDate: string; deadlineAnchor: string; progressKey: string; actionKey: string
}
const blankAdd: AddForm = {
  title: '', description: '', phase: '', assigneeType: 'role', assigneeRole: 'chef-unite', fanOutPerUnit: true,
  assigneeMemberIds: [], assigneeMemberNames: [], deadlineLabel: '', dueDate: '', deadlineAnchor: '', progressKey: '', actionKey: '',
}

// A task is coming up soon (amber) if it has a real due date within two weeks and isn't done/overdue.
function isUpcoming(task: RentreeTask): boolean {
  if (task.isDone || task.isOverdue || !task.dueDate) return false
  const due = new Date(task.dueDate).getTime()
  const now = Date.now()
  return due >= now && due <= now + 14 * 86400000
}

// Round check / lock / auto indicator shared by single and per-unit rows. Auto-tracked tasks (progressKey)
// aren't clickable — their state comes from the module; a manual task shows a clickable checkbox.
function CheckDot({ task, canManage, onToggle }: { task: RentreeTask; canManage: boolean; onToggle: (t: RentreeTask) => void }) {
  const done = task.isDone
  if (task.progressKey) {
    // Auto-tracked: reflects live module state, not manually checked.
    return (
      <span title="Suivi automatiquement" className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
        done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-amber-400 text-amber-500')}>
        {done ? <Check className="h-3 w-3" /> : <Activity className="h-2.5 w-2.5" />}
      </span>
    )
  }
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

// Deadline chip: the EFFECTIVE due date (anchor-resolved server-side) takes precedence over the fuzzy text
// label. Colour by urgency — red overdue, amber if within two weeks, muted otherwise. Hidden once done.
function Deadline({ task }: { task: RentreeTask }) {
  if (task.isDone || (!task.deadlineLabel && !task.dueDate)) return null
  const tone = task.isOverdue ? 'font-medium text-destructive' : isUpcoming(task) ? 'text-amber-600' : 'text-muted-foreground'
  return (
    <span className={cn('inline-flex items-center gap-1', tone)}>
      <CalendarClock className="h-3 w-3" />
      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR') : task.deadlineLabel}
      {task.isOverdue && ' — en retard'}
    </span>
  )
}

// Live progress chip: the task's module-state signal (a count/bool). Emerald when complete (auto-satisfied),
// amber while there's work left. A mini bar shows current/total when available.
function ProgressChip({ task }: { task: RentreeTask }) {
  if (!task.progressKey || !task.progressLabel) return null
  const done = task.progressComplete
  const hasBar = task.progressCurrent != null && task.progressTotal != null && task.progressTotal > 0
  const pct = hasBar ? Math.round((task.progressCurrent! / task.progressTotal!) * 100) : done ? 100 : 0
  return (
    <span className={cn('inline-flex items-center gap-1.5', done ? 'text-emerald-600' : 'text-amber-600')}>
      <Activity className="h-3 w-3" />
      {hasBar && (
        <span className="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-muted align-middle">
          <span className={cn('block h-full rounded-full', done ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
        </span>
      )}
      <span className="tabular-nums">{task.progressLabel}</span>
    </span>
  )
}

// The built-in action attached to a task, if any: a "do" action (run it here, CG only) or a "goto" shortcut.
// Shown only while the task is not done.
function TaskAction({ task, canManage, running, onRun }: {
  task: RentreeTask; canManage: boolean; running: boolean; onRun: (t: RentreeTask) => void
}) {
  const action = getRentreeAction(task.actionKey)
  if (!action || task.isDone) return null
  if (action.kind === 'do') {
    if (!canManage) return null // running a "do" action needs rentree.manage
    return (
      <Button size="sm" className="mt-2 h-7" disabled={task.isBlocked || running} onClick={() => onRun(task)}>
        <Play className="mr-1 h-3.5 w-3.5" />{running ? '…' : action.label}
      </Button>
    )
  }
  return action.route ? (
    <Button asChild variant="outline" size="sm" className="mt-2 h-7">
      <Link to={action.route}>{action.label}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
    </Button>
  ) : null
}

// A single (group-level) task, or one per-unit row inside a rollup (compact).
function TaskRow({ task, canManage, compact, running, onToggle, onEdit, onDelete, onRun }: {
  task: RentreeTask; canManage: boolean; compact?: boolean; running: boolean
  onToggle: (t: RentreeTask) => void; onEdit: (t: RentreeTask) => void; onDelete: (t: RentreeTask) => void; onRun: (t: RentreeTask) => void
}) {
  const done = task.isDone
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
          <ProgressChip task={task} />
          <Deadline task={task} />
          {/* Dedupe titles: a group task can depend on a per-unit prerequisite (one instance per unit), which
              would otherwise repeat the same title ~18×. Show each distinct blocking task title once. */}
          {task.isBlocked && <span className="inline-flex items-center gap-1 text-amber-600"><Lock className="h-3 w-3" />En attente : {[...new Set(task.blockedByTitles)].join(', ')}</span>}
          {done && task.completedByName && <span className="text-emerald-600">✓ {task.completedByName}</span>}
        </div>
        <TaskAction task={task} canManage={canManage} running={running} onRun={onRun} />
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-1">
          <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(task)}><Pencil className="h-3.5 w-3.5" /></Button></Tip>
          <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(task)}><Trash2 className="h-3.5 w-3.5" /></Button></Tip>
        </div>
      )}
    </div>
  )
}

type Rollup = { kind: 'rollup'; key: string; title: string; description: string | null; sample: RentreeTask; units: RentreeTask[]; done: number; blocked: number }
type Item = { kind: 'single'; task: RentreeTask } | Rollup

const itemKey = (it: Item) => it.kind === 'single' ? it.task.id : it.key
const itemOrder = (it: Item) => it.kind === 'single' ? it.task.displayOrder : it.sample.displayOrder

// One collapsed row standing in for a per-unit task across all units.
function RollupRow({ r, expanded, onExpand, canManage, runningId, onToggle, onEdit, onDelete, onRun }: {
  r: Rollup; expanded: boolean; onExpand: () => void; canManage: boolean; runningId: string | null
  onToggle: (t: RentreeTask) => void; onEdit: (t: RentreeTask) => void; onDelete: (t: RentreeTask) => void; onRun: (t: RentreeTask) => void
}) {
  const total = r.units.length
  const allDone = r.done === total
  const pct = total ? Math.round((r.done / total) * 100) : 0
  return (
    <div className="rounded-lg border">
      <button type="button" onClick={onExpand} className="flex w-full items-start gap-3 p-3 text-left">
        <ChevronRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
        {/* Stacks on mobile (progress bar under the text, full width); side-by-side on md+. */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-medium leading-snug', allDone && 'text-muted-foreground')}>{r.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{roleLabel(r.sample.assigneeRole)} · par unité</span>
              {r.sample.progressKey && <span className="inline-flex items-center gap-1 text-muted-foreground"><Activity className="h-3 w-3" />suivi auto</span>}
              <Deadline task={r.sample} />
              {r.blocked > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><Lock className="h-3 w-3" />{r.blocked} en attente</span>}
            </div>
          </div>
          <div className="flex w-full shrink-0 items-center gap-2 md:w-32">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all', allDone ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${pct}%` }} /></div>
            <span className={cn('w-12 text-right text-xs tabular-nums', allDone ? 'text-emerald-600' : 'text-muted-foreground')}>{r.done}/{total}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t bg-muted/20 px-2 pb-1">
          {r.units.map(u => <TaskRow key={u.id} task={u} canManage={canManage} compact running={runningId === u.id} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onRun={onRun} />)}
        </div>
      )}
    </div>
  )
}

// Arrange a phase's items into a dependency FOREST: each item nests under its closest same-phase prerequisite
// (the dep with the highest display order), so "do this, then this" reads as an indented tree. Cross-phase
// dependencies don't nest (the prerequisite lives in another phase) — they still show via the "En attente" hint.
// Returns a flattened pre-order list with a depth per item. Guards against cycles (already prevented server-side).
function buildForest(items: Item[]): { item: Item; depth: number }[] {
  const byKey = new Map(items.map(it => [itemKey(it), it]))
  // task id → the item key it belongs to (a rollup owns all its per-unit task ids).
  const taskToKey = new Map<string, string>()
  for (const it of items) {
    if (it.kind === 'single') taskToKey.set(it.task.id, itemKey(it))
    else for (const u of it.units) taskToKey.set(u.id, itemKey(it))
  }
  const depKeysOf = (it: Item): string[] => {
    const taskDeps = it.kind === 'single' ? it.task.dependsOnTaskIds : it.sample.dependsOnTaskIds
    const keys = new Set<string>()
    for (const d of taskDeps) { const k = taskToKey.get(d); if (k && k !== itemKey(it)) keys.add(k) }
    return [...keys]
  }
  const parentOf = new Map<string, string | null>()
  for (const it of items) {
    const cands = depKeysOf(it).map(k => byKey.get(k)).filter((x): x is Item => !!x)
    const parent = cands.length ? cands.reduce((a, b) => (itemOrder(b) > itemOrder(a) ? b : a)) : null
    parentOf.set(itemKey(it), parent ? itemKey(parent) : null)
  }
  const children = new Map<string, Item[]>()
  const roots: Item[] = []
  for (const it of items) {
    const p = parentOf.get(itemKey(it))
    if (p && byKey.has(p)) {
      const list = children.get(p) ?? []
      list.push(it)
      children.set(p, list)
    } else roots.push(it)
  }
  const out: { item: Item; depth: number }[] = []
  const seen = new Set<string>()
  const visit = (it: Item, depth: number) => {
    const k = itemKey(it)
    if (seen.has(k)) return
    seen.add(k)
    out.push({ item: it, depth })
    for (const c of (children.get(k) ?? []).sort((a, b) => itemOrder(a) - itemOrder(b))) visit(c, depth + 1)
  }
  for (const r of roots.sort((a, b) => itemOrder(a) - itemOrder(b))) visit(r, 0)
  // Safety: append any item never visited (shouldn't happen without a cycle) at depth 0.
  for (const it of items) if (!seen.has(itemKey(it))) out.push({ item: it, depth: 0 })
  return out
}

// "Rentrée scoute" — scout-year startup checklist, visible to ALL members. Each member sees the tasks
// assigned to them (round-check to complete; locked while a prerequisite is unfinished; some tasks track
// module state automatically). Managers (CG / super-admin, canManage) additionally get: the whole-group view,
// a per-unit filter, edit/delete per task, generate-from-template, refresh-assignees, and the "Modèle" editor.
// Within a phase, tasks nest under their prerequisites; per-unit instances collapse into a RollupRow.
export default function RentreePage() {
  const { user, hasPermission } = useAuthStore()
  const canManage = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.RENTREE_MANAGE)

  const { data: years, isLoading: yearsLoading } = useRentreeYears()
  const [year, setYear] = useState<string>('')
  const [mineOnly, setMineOnly] = useState(false)
  const [unitFilter, setUnitFilter] = useState<string>('all')
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [expandedRollups, setExpandedRollups] = useState<Set<string>>(new Set())

  if (!year && years && years.length > 0) setYear(years[0]) // default to newest year (render-phase, guarded)

  const { data: tasks, isLoading } = useRentreeTasks(year || undefined, mineOnly)
  const complete = useCompleteRentreeTask()
  const runAction = useRunRentreeTaskAction()
  const generate = useGenerateRentree()
  const updateTask = useUpdateRentreeTask()
  const deleteTask = useDeleteRentreeTask()
  const createTask = useCreateRentreeTask()
  const refreshAssignees = useRefreshRentreeAssignees()

  const [genOpen, setGenOpen] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [genYear, setGenYear] = useState('2026-2027')
  const [editing, setEditing] = useState<RentreeTask | null>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', deadlineLabel: '', dueDate: '', deadlineAnchor: '', progressKey: '' })
  const [deleting, setDeleting] = useState<RentreeTask | null>(null)
  // One-off "add a task to this year" dialog + member picker (for assigneeType === 'members').
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>(blankAdd)
  const [memberSearch, setMemberSearch] = useState('')
  const debouncedMember = useDebounce(memberSearch)
  const { data: memberResults } = useMembers({ search: debouncedMember || undefined, pageSize: 8 })
  const yearPhases = useMemo(() => [...new Set((tasks ?? []).map(t => t.phase))], [tasks])

  // Units present in this year's per-unit tasks (for the filter).
  const units = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tasks ?? []) if (t.unitId && t.unitName) m.set(t.unitId, t.unitName)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [tasks])

  // Collapse per-unit duplicates into rollups only in the unfiltered whole-group view; "Mes tâches" and a
  // single-unit filter show flat rows.
  const rollupMode = !mineOnly && unitFilter === 'all'

  // Build phase → forest rows (preserving first-seen phase order). In rollup mode, per-unit tasks sharing a
  // templateId collapse into one Rollup (with done/blocked counts); group tasks stay 'single'. Each phase's
  // items are then arranged into a dependency tree (buildForest). "Done" uses the EFFECTIVE done (isDone) so
  // auto-tracked tasks count too; a rollup is done when all its units are done.
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
            done: ts.filter(t => t.isDone).length, blocked: ts.filter(t => t.isBlocked).length,
          }
        })
      } else {
        items = phaseTasks.map(t => ({ kind: 'single', task: t }))
      }
      const rows = buildForest(items)
      const total = items.length
      const done = items.filter(it => it.kind === 'single' ? it.task.isDone : it.done === it.units.length).length
      return { phase, rows, done, total }
    })
  }, [tasks, mineOnly, unitFilter, rollupMode])

  const total = tasks?.length ?? 0
  const doneCount = tasks?.filter(t => t.isDone).length ?? 0
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  const toggle = async (t: RentreeTask) => {
    try { await complete.mutateAsync({ id: t.id, done: !t.isDone }) }
    catch (err) { toast.error(parseApiError(err)) }
  }
  // Run a task's built-in "do" action (open inscriptions / passage) directly from the list.
  const runningId = runAction.isPending ? (runAction.variables as string) : null
  const doRunAction = async (t: RentreeTask) => {
    try { const r = await runAction.mutateAsync(t.id); toast.success(r.message) }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const openEdit = (t: RentreeTask) => {
    setEditing(t)
    setEditForm({ title: t.title, description: t.description ?? '', deadlineLabel: t.deadlineLabel ?? '', dueDate: t.dueDate ?? '', deadlineAnchor: t.deadlineAnchor ?? '', progressKey: t.progressKey ?? '' })
  }
  const saveEdit = async () => {
    if (!editing) return
    try {
      await updateTask.mutateAsync({
        id: editing.id, title: editForm.title, description: editForm.description || null,
        deadlineLabel: editForm.deadlineLabel || null, dueDate: editForm.dueDate || null,
        deadlineAnchor: editForm.deadlineAnchor || null, progressKey: editForm.progressKey || null,
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
  // Non-destructive: add template tasks missing from an existing year + refresh template-derived fields (keeps progress).
  const doAddNew = async () => {
    try {
      const r = await generate.mutateAsync({ scoutYear: genYear.trim(), overwrite: false, addOnly: true })
      toast.success(r.created > 0 ? `${r.created} nouvelle(s) tâche(s) ajoutée(s)` : 'Modèle synchronisé (aucune nouvelle tâche).')
      setGenOpen(false); setYear(genYear.trim())
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const doRefreshAssignees = async () => {
    try {
      const r = await refreshAssignees.mutateAsync(year)
      toast.success(r.changed > 0 ? `Responsables mis à jour (${r.changed} tâche(s)).` : 'Responsables déjà à jour.')
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const openAdd = () => { setAddForm({ ...blankAdd, phase: yearPhases[0] ?? 'Configuration' }); setMemberSearch(''); setAddOpen(true) }
  const submitAdd = async () => {
    if (!addForm.title.trim()) { toast.error('Le titre est requis.'); return }
    try {
      const r = await createTask.mutateAsync({
        scoutYear: year, title: addForm.title, description: addForm.description || null, phase: addForm.phase,
        assigneeType: addForm.assigneeType, assigneeRole: addForm.assigneeType === 'role' ? addForm.assigneeRole : null,
        fanOutPerUnit: addForm.assigneeType === 'role' && addForm.fanOutPerUnit,
        assigneeMemberIds: addForm.assigneeType === 'members' ? addForm.assigneeMemberIds : [],
        deadlineLabel: addForm.deadlineLabel || null, dueDate: addForm.dueDate || null,
        deadlineAnchor: addForm.deadlineAnchor || null, progressKey: addForm.progressKey || null, actionKey: addForm.actionKey || null,
      })
      toast.success(`${r.created} tâche(s) ajoutée(s)`); setAddOpen(false)
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const togglePhase = (p: string) => setCollapsedPhases(s => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })
  const toggleRollup = (k: string) => setExpandedRollups(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

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
              {!noYears && <Tip content="Ré-attribue les tâches de rôle aux responsables actuels (ex. un CU confirmé après la génération)."><Button variant="outline" size="sm" onClick={doRefreshAssignees} disabled={refreshAssignees.isPending}><RefreshCw className={cn('mr-1 h-4 w-4', refreshAssignees.isPending && 'animate-spin')} />Responsables</Button></Tip>}
              {!noYears && <Button variant="outline" size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" />Ajouter une tâche</Button>}
              <Tip content="Modifier les tâches type recopiées chaque année"><Button variant="outline" size="sm" asChild><Link to="/admin/rentree-template"><Settings2 className="mr-1 h-4 w-4" />Modèle de rentrée</Link></Button></Tip>
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
           phases.map(({ phase, rows, done, total }) => {
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
                    {rows.map(({ item: it, depth }) => (
                      // Nested tasks are indented under their prerequisite, with a left guide line.
                      <div key={itemKey(it)} style={{ marginLeft: depth ? depth * 20 : 0 }}
                        className={cn(depth > 0 && 'border-l-2 border-muted pl-3')}>
                        {it.kind === 'single'
                          ? <TaskRow task={it.task} canManage={canManage} running={runningId === it.task.id} onToggle={toggle} onEdit={openEdit} onDelete={setDeleting} onRun={doRunAction} />
                          : <RollupRow r={it} expanded={expandedRollups.has(it.key)} onExpand={() => toggleRollup(it.key)} canManage={canManage} runningId={runningId} onToggle={toggle} onEdit={openEdit} onDelete={setDeleting} onRun={doRunAction} />}
                      </div>
                    ))}
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
            {years?.includes(genYear.trim()) && (
              <p className="text-xs text-muted-foreground">Une liste existe déjà pour {genYear.trim()}. <b>Ajouter les nouvelles tâches</b> insère les tâches du modèle absentes et met à jour les libellés / échéances / suivis depuis le modèle (progression conservée) ; <b className="text-amber-600">Tout régénérer</b> efface la progression et recrée tout.</p>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setGenOpen(false)}>Annuler</Button>
            {years?.includes(genYear.trim()) ? (
              <>
                {/* Destructive full regenerate goes through a confirm; add-new is the safe default. */}
                <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirmRegen(true)} disabled={generate.isPending}>Tout régénérer</Button>
                <Button onClick={doAddNew} disabled={generate.isPending}>{generate.isPending ? '…' : 'Ajouter les nouvelles tâches'}</Button>
              </>
            ) : (
              <Button onClick={() => doGenerate(false)} disabled={generate.isPending}>{generate.isPending ? 'Génération…' : 'Générer'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-generate confirmation — overwriting an existing year erases all completed tasks / progress */}
      <ConfirmDialog open={confirmRegen} onOpenChange={() => setConfirmRegen(false)} title="Régénérer la liste de rentrée" variant="destructive"
        description={`Une liste existe déjà pour ${genYear.trim()}. La régénérer effacera TOUTE la progression actuelle (tâches terminées, échéances modifiées) pour cette année et la recréera à partir du modèle. Cette action est irréversible.`}
        confirmLabel="Régénérer" loading={generate.isPending}
        onConfirm={async () => { await doGenerate(true); setConfirmRegen(false) }} />

      {/* Edit task dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Modifier la tâche{editing?.unitName ? ` — ${editing.unitName}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><RequiredLabel required>Titre</RequiredLabel><Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="space-y-1"><RequiredLabel>Description</RequiredLabel><Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><RequiredLabel>Échéance (texte)</RequiredLabel><Input value={editForm.deadlineLabel} onChange={e => setEditForm(f => ({ ...f, deadlineLabel: e.target.value }))} placeholder="1ʳᵉ sem. octobre" /></div>
              <div className="space-y-1"><RequiredLabel>Date limite</RequiredLabel><Input type="date" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><RequiredLabel>Échéance basée sur une date</RequiredLabel>
              <Select value={editForm.deadlineAnchor || 'none'} onValueChange={v => setEditForm(f => ({ ...f, deadlineAnchor: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RENTREE_ANCHOR_OPTIONS.map(o => <SelectItem key={o.value || 'none'} value={o.value || 'none'}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              {editForm.deadlineAnchor && <p className="text-xs text-muted-foreground">L'échéance suit la date « {anchorLabel(editForm.deadlineAnchor)} » (Paramètres).</p>}
            </div>
            <div className="space-y-1"><RequiredLabel>Suivi automatique</RequiredLabel>
              <Select value={editForm.progressKey || 'none'} onValueChange={v => setEditForm(f => ({ ...f, progressKey: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RENTREE_PROGRESS_OPTIONS.map(o => <SelectItem key={o.value || 'none'} value={o.value || 'none'}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
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

      {/* Add one-off task dialog — year-specific, does NOT modify the template */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Ajouter une tâche — {year}</DialogTitle></DialogHeader>
          <div className="min-w-0 space-y-3">
            <div className="space-y-1"><RequiredLabel required>Titre</RequiredLabel><Input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="space-y-1"><RequiredLabel>Description</RequiredLabel><Input value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1"><RequiredLabel required>Phase</RequiredLabel>
                <Input list="year-phases" value={addForm.phase} onChange={e => setAddForm(f => ({ ...f, phase: e.target.value }))} placeholder="Configuration…" />
                <datalist id="year-phases">{yearPhases.map(p => <option key={p} value={p} />)}</datalist>
              </div>
              <div className="space-y-1"><RequiredLabel>Échéance (texte)</RequiredLabel><Input value={addForm.deadlineLabel} onChange={e => setAddForm(f => ({ ...f, deadlineLabel: e.target.value }))} placeholder="1ʳᵉ sem. octobre" /></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1"><RequiredLabel>Date limite</RequiredLabel><Input type="date" value={addForm.dueDate} onChange={e => setAddForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
              <div className="space-y-1"><RequiredLabel>Échéance basée sur</RequiredLabel>
                <Select value={addForm.deadlineAnchor || 'none'} onValueChange={v => setAddForm(f => ({ ...f, deadlineAnchor: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RENTREE_ANCHOR_OPTIONS.map(o => <SelectItem key={o.value || 'none'} value={o.value || 'none'}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1"><RequiredLabel>Suivi automatique</RequiredLabel>
              <Select value={addForm.progressKey || 'none'} onValueChange={v => setAddForm(f => ({ ...f, progressKey: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RENTREE_PROGRESS_OPTIONS.map(o => <SelectItem key={o.value || 'none'} value={o.value || 'none'}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1"><RequiredLabel>Action</RequiredLabel>
              <Select value={addForm.actionKey || 'none'} onValueChange={v => setAddForm(f => ({ ...f, actionKey: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RENTREE_ACTION_OPTIONS.map(o => <SelectItem key={o.value || 'none'} value={o.value || 'none'}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1"><RequiredLabel required>Responsable</RequiredLabel>
              <Select value={addForm.assigneeType} onValueChange={v => setAddForm(f => ({ ...f, assigneeType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="role">Un rôle</SelectItem><SelectItem value="members">Des membres précis</SelectItem></SelectContent>
              </Select>
            </div>

            {addForm.assigneeType === 'role' ? (
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
                <div className="space-y-1"><RequiredLabel>Rôle</RequiredLabel>
                  <Select value={addForm.assigneeRole} onValueChange={v => setAddForm(f => ({ ...f, assigneeRole: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={addForm.fanOutPerUnit} onChange={e => setAddForm(f => ({ ...f, fanOutPerUnit: e.target.checked }))} />Une tâche par unité</label>
              </div>
            ) : (
              <div className="space-y-1">
                <RequiredLabel>Membres</RequiredLabel>
                <div className="flex flex-wrap gap-1.5">
                  {addForm.assigneeMemberIds.map((id, i) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
                      {addForm.assigneeMemberNames[i] ?? '?'}
                      <button type="button" onClick={() => setAddForm(f => ({ ...f, assigneeMemberIds: f.assigneeMemberIds.filter(x => x !== id), assigneeMemberNames: f.assigneeMemberNames.filter((_, j) => j !== i) }))}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
                <Input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Rechercher un membre…" />
                {debouncedMember && memberResults && (
                  <div className="max-h-40 overflow-y-auto rounded-md border text-sm">
                    {memberResults.items.filter(m => !addForm.assigneeMemberIds.includes(m.id)).map(m => (
                      <button key={m.id} type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted"
                        onClick={() => { setAddForm(f => ({ ...f, assigneeMemberIds: [...f.assigneeMemberIds, m.id], assigneeMemberNames: [...f.assigneeMemberNames, `${m.firstName} ${m.lastName}`] })); setMemberSearch('') }}>
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />{m.lastName} {m.firstName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Ajoutée uniquement à l'année {year} (le modèle n'est pas modifié). « Une tâche par unité » en crée une par unité active.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button onClick={submitAdd} disabled={createTask.isPending}>{createTask.isPending ? 'Ajout…' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Supprimer la tâche"
        description={`Supprimer « ${deleting?.title} »${deleting?.unitName ? ` (${deleting.unitName})` : ''} de la liste ${year} ?`} confirmLabel="Supprimer" variant="destructive"
        onConfirm={async () => { if (deleting) { try { await deleteTask.mutateAsync(deleting.id); toast.success('Supprimée'); setDeleting(null) } catch (err) { toast.error(parseApiError(err)) } } }} />
    </div>
  )
}
