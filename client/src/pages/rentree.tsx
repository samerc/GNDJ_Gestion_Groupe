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
import { Check, Lock, CalendarClock, Users, Settings2, Sparkles, Pencil, Trash2, ListChecks } from 'lucide-react'
import { toast } from 'sonner'

const ROLE_LABELS: Record<string, string> = {
  'chef-de-groupe': 'Chef de Groupe', 'chef-unite': "Chef d'unité", 'assistant-de-groupe': 'Assistant de Groupe',
  'chef-equipe': "Chef d'équipe", 'read-only': 'Membre',
}

function TaskRow({ task, canManage, onToggle, onEdit, onDelete }: {
  task: RentreeTask; canManage: boolean
  onToggle: (t: RentreeTask) => void; onEdit: (t: RentreeTask) => void; onDelete: (t: RentreeTask) => void
}) {
  const done = task.status === 'done'
  const canTick = (task.isMine || canManage) && !task.isBlocked
  const assignee = task.unitName
    ? `${ROLE_LABELS[task.assigneeRole ?? ''] ?? task.assigneeRole} · ${task.unitName}`
    : task.assigneeNames.length > 0 ? task.assigneeNames.join(', ')
    : ROLE_LABELS[task.assigneeRole ?? ''] ?? (task.assigneeRole ?? '—')

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-3 transition-colors',
      done ? 'bg-muted/40' : task.isBlocked ? 'opacity-70' : 'bg-background',
      task.isMine && !done && 'border-l-2 border-l-primary')}>
      <button type="button" disabled={!canTick} onClick={() => onToggle(task)}
        title={task.isBlocked ? 'Bloquée par une tâche préalable' : done ? 'Rouvrir' : 'Marquer terminée'}
        className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          done ? 'border-emerald-500 bg-emerald-500 text-white'
            : task.isBlocked ? 'border-muted-foreground/30 cursor-not-allowed'
            : 'border-muted-foreground/40 hover:border-primary cursor-pointer')}>
        {done ? <Check className="h-3 w-3" /> : task.isBlocked ? <Lock className="h-2.5 w-2.5 text-muted-foreground" /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium leading-snug', done && 'text-muted-foreground line-through')}>{task.title}</p>
        {task.description && <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{assignee}</span>
          {(task.deadlineLabel || task.dueDate) && (
            <span className={cn('inline-flex items-center gap-1', task.isOverdue && 'font-medium text-destructive')}>
              <CalendarClock className="h-3 w-3" />
              {task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR') : task.deadlineLabel}
              {task.isOverdue && ' — en retard'}
            </span>
          )}
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

export default function RentreePage() {
  const { user, hasPermission } = useAuthStore()
  const canManage = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.RENTREE_MANAGE)

  const { data: years, isLoading: yearsLoading } = useRentreeYears()
  const [year, setYear] = useState<string>('')
  const [mineOnly, setMineOnly] = useState(false)

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

  const phases = useMemo(() => {
    const map = new Map<string, RentreeTask[]>()
    for (const t of tasks ?? []) { if (!map.has(t.phase)) map.set(t.phase, []); map.get(t.phase)!.push(t) }
    return [...map.entries()]
  }, [tasks])

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
          <div className="flex h-9 items-center rounded-md border p-0.5 text-xs">
            <button type="button" className={cn('h-full rounded px-2.5 font-medium', !mineOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} onClick={() => setMineOnly(false)}>Toutes</button>
            <button type="button" className={cn('h-full rounded px-2.5 font-medium', mineOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} onClick={() => setMineOnly(true)}>Mes tâches</button>
          </div>
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
          {/* Progress */}
          <div className="rounded-lg border p-3">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium">{doneCount}/{total} terminée{total > 1 ? 's' : ''}{mineOnly ? ' (mes tâches)' : ''}</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
          </div>

          {isLoading ? <div className="flex h-40 items-center justify-center"><LoadingSpinner /></div> :
           total === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{mineOnly ? "Vous n'avez aucune tâche assignée." : 'Aucune tâche.'}</p> :
           phases.map(([phase, items]) => (
            <div key={phase} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{phase}</h2>
              <div className="space-y-2">
                {items.map(t => <TaskRow key={t.id} task={t} canManage={canManage} onToggle={toggle} onEdit={openEdit} onDelete={setDeleting} />)}
              </div>
            </div>
          ))}
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
          <DialogHeader><DialogTitle>Modifier la tâche</DialogTitle></DialogHeader>
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
        description={`Supprimer « ${deleting?.title} » de la liste ${year} ?`} confirmLabel="Supprimer" variant="destructive"
        onConfirm={async () => { if (deleting) { try { await deleteTask.mutateAsync(deleting.id); toast.success('Supprimée'); setDeleting(null) } catch (err) { toast.error(parseApiError(err)) } } }} />
    </div>
  )
}
