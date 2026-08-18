// Admin "Progression scoute" screen (super-admin / CG). Manages, per unit type, the scout STAGES
// (an ordered, drag-reorderable ladder) and BADGES (a chip grid). A unit-type pill picker at the top
// scopes both. Delete = archive-if-used (a stage/badge held by members is deactivated, not removed);
// the same StagesLadder/BadgesGrid are also embedded on the unit-type detail page.
import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import {
  useScoutStages, useCreateScoutStage, useUpdateScoutStage, useDeleteScoutStage, useReorderScoutStages, type ScoutStageDto,
  useBadges, useCreateBadge, useUpdateBadge, useDeleteBadge, type BadgeDto,
} from '@/services/progression-service'
import { useUnitTypes as useUnitTypesQuery } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Award, Star, GripVertical } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Scouting parcours order (by unit-type code) so the pills follow the progression path — youngest branch to
// oldest, then the cross-branch/group types — instead of alphabetical. Unknown codes fall to the end (by name).
const PROG_RANK: Record<string, number> = { MEU: 0, RON: 1, TRO: 2, COM: 3, CLA: 4, CLAN: 4, NOY: 5, JEM: 6, FEU: 7, CAR: 8, GRP: 9, G: 9 }
const progRank = (code?: string) => PROG_RANK[(code ?? '').toUpperCase()] ?? 99

export default function ProgressionPage() {
  const { data: unitTypesData } = useUnitTypesQuery({ pageSize: 100 })
  const unitTypes = (unitTypesData?.items ?? [])
    .map(ut => ({ id: ut.id, name: ut.name, code: ut.code }))
    .sort((a, b) => progRank(a.code) - progRank(b.code) || a.name.localeCompare(b.name))
  const [selected, setSelected] = useState('')

  // Default to the first unit type once loaded (unit-type-first UX — no all-types jumble). Render-phase
  // init (React's alternative to a syncing effect): runs once, self-guarded by !selected.
  if (!selected && unitTypes.length) setSelected(unitTypes[0].id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Progression scoute</h1>
        <p className="text-sm text-muted-foreground">Étapes et badges, par type d'unité.</p>
      </div>

      {/* Unit-type pills */}
      <div className="flex flex-wrap gap-2">
        {unitTypes.map(ut => (
          <button
            key={ut.id}
            onClick={() => setSelected(ut.id)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              selected === ut.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'
            )}
          >
            {ut.name}
          </button>
        ))}
      </div>

      {!selected ? (
        <EmptyState icon={Star} title="Aucun type d'unité" description="Créez d'abord des types d'unité." />
      ) : (
        <Tabs defaultValue="stages">
          <TabsList>
            <TabsTrigger value="stages"><Star className="mr-1 h-4 w-4" />Étapes</TabsTrigger>
            <TabsTrigger value="badges"><Award className="mr-1 h-4 w-4" />Badges</TabsTrigger>
          </TabsList>
          <TabsContent value="stages"><StagesLadder unitTypeId={selected} /></TabsContent>
          <TabsContent value="badges"><BadgesGrid unitTypeId={selected} /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}

// ════════════════════════ Étapes (ladder) ════════════════════════
export function StagesLadder({ unitTypeId }: { unitTypeId: string }) {
  const { data, isLoading } = useScoutStages(unitTypeId)
  const createMutation = useCreateScoutStage()
  const updateMutation = useUpdateScoutStage()
  const deleteMutation = useDeleteScoutStage()
  const reorderMutation = useReorderScoutStages()
  const [editing, setEditing] = useState<ScoutStageDto | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<ScoutStageDto | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const stages = data ?? []
  const toggleOne = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Bulk delete runs the per-item delete (archive-if-used) for each selection and tallies the
  // outcomes (res.archived distinguishes archived-because-used from hard-deleted) into one toast.
  const handleBulkDelete = async () => {
    setBulkBusy(true)
    let deleted = 0, archived = 0, failed = 0
    const results = await Promise.allSettled([...selected].map(id => deleteMutation.mutateAsync(id)))
    for (const r of results) { if (r.status === 'rejected') failed++; else if (r.value?.archived) archived++; else deleted++ }
    setBulkBusy(false); setBulkConfirm(false); setSelected(new Set())
    const parts = []
    if (deleted) parts.push(`${deleted} supprimée(s)`)
    if (archived) parts.push(`${archived} désactivée(s) (utilisée(s))`)
    if (failed) parts.push(`${failed} échec(s)`)
    if (failed && !deleted && !archived) toast.error(parts.join(' · ')); else toast.success(parts.join(' · ') || 'Terminé')
  }

  // Drag-reorder the ladder: compute the moved order locally and persist the new id sequence
  // (server rewrites displayOrder from the array position).
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = stages.findIndex(s => s.id === active.id)
    const newIndex = stages.findIndex(s => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    // No local optimistic state here — the list renders from the query cache (untouched until the
    // reorder succeeds + invalidates), so on failure the order self-corrects; just surface the error.
    reorderMutation.mutate(arrayMove(stages, oldIndex, newIndex).map(s => s.id), {
      onError: (err) => toast.error(parseApiError(err)),
    })
  }

  const toggleActive = async (s: ScoutStageDto) => {
    try {
      await updateMutation.mutateAsync({ id: s.id, unitTypeId: s.unitTypeId, code: s.code, name: s.name, description: s.description, displayOrder: s.displayOrder, isActive: !s.isActive, isBadgeStage: s.isBadgeStage })
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { const res = await deleteMutation.mutateAsync(deleting.id); toast.success(res?.archived ? 'Étape désactivée (utilisée par des membres)' : 'Étape supprimée'); setDeleting(null) }
    catch (err) { toast.error(parseApiError(err)); setDeleting(null) }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Ajouter une étape</Button>
      </div>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <span className="text-sm text-muted-foreground">{selected.size} sélectionnée(s)</span>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Annuler</Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkConfirm(true)}><Trash2 className="mr-1 h-3.5 w-3.5" />Supprimer la sélection</Button>
        </div>
      )}
      {isLoading ? <LoadingSpinner variant="table" /> : stages.length === 0 ? (
        <EmptyState icon={Star} title="Aucune étape" description="Ajoutez la première étape de progression avec le bouton ci-dessus." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {stages.map((s, i) => (
                <StageCard key={s.id} stage={s} index={i} busy={updateMutation.isPending}
                  checked={selected.has(s.id)} onCheck={() => toggleOne(s.id)}
                  onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} onToggle={() => toggleActive(s)} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <StageFormDialog
        open={adding || !!editing}
        stage={editing}
        unitTypeId={unitTypeId}
        nextOrder={stages.length}
        createMutation={createMutation}
        updateMutation={updateMutation}
        onClose={() => { setAdding(false); setEditing(null) }}
      />
      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)}
        title={(deleting?.progressionCount ?? 0) > 0 ? "Désactiver l'étape" : "Supprimer l'étape"}
        description={(deleting?.progressionCount ?? 0) > 0
          ? `« ${deleting?.name} » est utilisée par ${deleting?.progressionCount} membre(s) : elle sera désactivée (masquée des listes mais conservée sur les membres) plutôt que supprimée.`
          : `Supprimer « ${deleting?.name} » ?`}
        confirmLabel={(deleting?.progressionCount ?? 0) > 0 ? 'Désactiver' : 'Supprimer'} variant="destructive" loading={deleteMutation.isPending} onConfirm={handleDelete} />
      <ConfirmDialog open={bulkConfirm} onOpenChange={() => setBulkConfirm(false)} title="Supprimer la sélection"
        description={`${selected.size} étape(s) sélectionnée(s). Celles utilisées par des membres seront désactivées (conservées sur les membres), les autres supprimées.`}
        confirmLabel="Confirmer" variant="destructive" loading={bulkBusy} onConfirm={handleBulkDelete} />
    </div>
  )
}

// One rung of the ladder: drag handle, position number (1-based), name + badge/usage info,
// active Switch (inline toggle), edit/delete. `index` is the visual rank, not displayOrder.
function StageCard({ stage, index, busy, checked, onCheck, onEdit, onDelete, onToggle }: {
  stage: ScoutStageDto; index: number; busy: boolean; checked: boolean; onCheck: () => void; onEdit: () => void; onDelete: () => void; onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-3 rounded-lg border bg-card p-3', isDragging && 'shadow-lg', !stage.isActive && 'opacity-55')}>
      <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" aria-label={`Sélectionner ${stage.name}`} checked={checked} onChange={onCheck} />
      <Tip content="Glisser pour réordonner"><button {...attributes} {...listeners} className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button></Tip>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{stage.name}</span>
          <span className="text-xs text-muted-foreground">{stage.code}</span>
        </div>
        {stage.description && <p className="truncate text-xs text-muted-foreground">{stage.description}</p>}
      </div>
      {stage.progressionCount > 0 && <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">{stage.progressionCount} membre{stage.progressionCount > 1 ? 's' : ''}</span>}
      <Tip content={stage.isActive ? 'Désactiver' : 'Activer'}><Switch checked={stage.isActive} onCheckedChange={onToggle} disabled={busy} /></Tip>
      <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button></Tip>
      <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></Tip>
    </li>
  )
}

// Create/edit a stage in one modal. `stage` null = create mode (blank form, code auto-generated if empty).
function StageFormDialog({ open, stage, unitTypeId, nextOrder, createMutation, updateMutation, onClose }: {
  open: boolean
  stage: ScoutStageDto | null
  unitTypeId: string
  nextOrder: number
  createMutation: ReturnType<typeof useCreateScoutStage>
  updateMutation: ReturnType<typeof useUpdateScoutStage>
  onClose: () => void
}) {
  const blank = { name: '', code: '', description: '', isActive: true, isBadgeStage: false }
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  // Reset/hydrate the form each time the dialog opens (render-phase; blank for create, the stage for edit).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setError('')
      setForm(stage ? { name: stage.name, code: stage.code, description: stage.description ?? '', isActive: stage.isActive, isBadgeStage: stage.isBadgeStage } : blank)
    }
  }
  const saving = createMutation.isPending || updateMutation.isPending

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Le nom est requis.'); return }
    setError('')
    try {
      if (stage) {
        await updateMutation.mutateAsync({ id: stage.id, unitTypeId: stage.unitTypeId, displayOrder: stage.displayOrder, code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null, isActive: form.isActive, isBadgeStage: form.isBadgeStage })
        toast.success('Étape modifiée')
      } else {
        await createMutation.mutateAsync({ unitTypeId, code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null, displayOrder: nextOrder, isActive: form.isActive, isBadgeStage: form.isBadgeStage })
        toast.success('Étape ajoutée')
      }
      onClose()
    } catch (err) { setError(parseApiError(err)) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{stage ? "Modifier l'étape" : 'Nouvelle étape'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-2"><label className="text-sm font-medium">Nom</label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex : 1ère étoile" autoFocus /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Description</label><Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="space-y-2"><label className="text-xs text-muted-foreground">Code (avancé)</label><Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} className="font-mono text-sm" placeholder="Laissé vide = généré automatiquement" /></div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />Active</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>{stage ? 'Enregistrer' : 'Ajouter'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ════════════════════════ Badges (grid) ════════════════════════
export function BadgesGrid({ unitTypeId }: { unitTypeId: string }) {
  const { data, isLoading } = useBadges(unitTypeId)
  const createMutation = useCreateBadge()
  const updateMutation = useUpdateBadge()
  const deleteMutation = useDeleteBadge()
  const [editing, setEditing] = useState<BadgeDto | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<BadgeDto | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const badges = data ?? []
  const toggleOne = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const handleBulkDelete = async () => {
    setBulkBusy(true)
    let deleted = 0, archived = 0, failed = 0
    const results = await Promise.allSettled([...selected].map(id => deleteMutation.mutateAsync(id)))
    for (const r of results) { if (r.status === 'rejected') failed++; else if (r.value?.archived) archived++; else deleted++ }
    setBulkBusy(false); setBulkConfirm(false); setSelected(new Set())
    const parts = []
    if (deleted) parts.push(`${deleted} supprimé(s)`)
    if (archived) parts.push(`${archived} désactivé(s) (utilisé(s))`)
    if (failed) parts.push(`${failed} échec(s)`)
    if (failed && !deleted && !archived) toast.error(parts.join(' · ')); else toast.success(parts.join(' · ') || 'Terminé')
  }

  const toggleActive = async (b: BadgeDto) => {
    try {
      await updateMutation.mutateAsync({ id: b.id, unitTypeId: b.unitTypeId, code: b.code, name: b.name, description: b.description, displayOrder: b.displayOrder, isActive: !b.isActive })
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { const res = await deleteMutation.mutateAsync(deleting.id); toast.success(res?.archived ? 'Badge désactivé (obtenu par des membres)' : 'Badge supprimé'); setDeleting(null) }
    catch (err) { toast.error(parseApiError(err)); setDeleting(null) }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Ajouter un badge</Button>
      </div>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <span className="text-sm text-muted-foreground">{selected.size} sélectionné(s)</span>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Annuler</Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkConfirm(true)}><Trash2 className="mr-1 h-3.5 w-3.5" />Supprimer la sélection</Button>
        </div>
      )}
      {isLoading ? <LoadingSpinner variant="cards" /> : badges.length === 0 ? (
        <EmptyState icon={Award} title="Aucun badge" description="Ajoutez le premier badge avec le bouton ci-dessus." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map(b => (
            <div key={b.id} className={cn('group flex items-center gap-3 rounded-lg border bg-card p-3', !b.isActive && 'opacity-55')}>
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" aria-label={`Sélectionner ${b.name}`} checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} />
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Award className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground">{b.code}{b.progressionCount > 0 ? ` · ${b.progressionCount} membre${b.progressionCount > 1 ? 's' : ''}` : ''}</div>
              </div>
              <Tip content={b.isActive ? 'Désactiver' : 'Activer'}><Switch checked={b.isActive} onCheckedChange={() => toggleActive(b)} disabled={updateMutation.isPending} /></Tip>
              <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(b)}><Pencil className="h-3.5 w-3.5" /></Button></Tip>
                <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(b)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></Tip>
              </div>
            </div>
          ))}
        </div>
      )}

      <BadgeFormDialog
        open={adding || !!editing}
        badge={editing}
        unitTypeId={unitTypeId}
        nextOrder={badges.length}
        createMutation={createMutation}
        updateMutation={updateMutation}
        onClose={() => { setAdding(false); setEditing(null) }}
      />
      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)}
        title={(deleting?.progressionCount ?? 0) > 0 ? 'Désactiver le badge' : 'Supprimer le badge'}
        description={(deleting?.progressionCount ?? 0) > 0
          ? `« ${deleting?.name} » a été obtenu par ${deleting?.progressionCount} membre(s) : il sera désactivé (masqué des listes mais conservé sur les membres) plutôt que supprimé.`
          : `Supprimer « ${deleting?.name} » ?`}
        confirmLabel={(deleting?.progressionCount ?? 0) > 0 ? 'Désactiver' : 'Supprimer'} variant="destructive" loading={deleteMutation.isPending} onConfirm={handleDelete} />
      <ConfirmDialog open={bulkConfirm} onOpenChange={() => setBulkConfirm(false)} title="Supprimer la sélection"
        description={`${selected.size} badge(s) sélectionné(s). Ceux obtenus par des membres seront désactivés (conservés sur les membres), les autres supprimés.`}
        confirmLabel="Confirmer" variant="destructive" loading={bulkBusy} onConfirm={handleBulkDelete} />
    </div>
  )
}

// Create/edit a badge in one modal. `badge` null = create mode (blank form, code auto-generated if empty).
function BadgeFormDialog({ open, badge, unitTypeId, nextOrder, createMutation, updateMutation, onClose }: {
  open: boolean
  badge: BadgeDto | null
  unitTypeId: string
  nextOrder: number
  createMutation: ReturnType<typeof useCreateBadge>
  updateMutation: ReturnType<typeof useUpdateBadge>
  onClose: () => void
}) {
  const blank = { name: '', code: '', description: '', isActive: true }
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  // Reset/hydrate the form each time the dialog opens (render-phase; blank for create, the badge for edit).
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setError('')
      setForm(badge ? { name: badge.name, code: badge.code, description: badge.description ?? '', isActive: badge.isActive } : blank)
    }
  }
  const saving = createMutation.isPending || updateMutation.isPending

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Le nom est requis.'); return }
    setError('')
    try {
      if (badge) {
        await updateMutation.mutateAsync({ id: badge.id, unitTypeId: badge.unitTypeId, displayOrder: badge.displayOrder, code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null, isActive: form.isActive })
        toast.success('Badge modifié')
      } else {
        await createMutation.mutateAsync({ unitTypeId, code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null, displayOrder: nextOrder, isActive: form.isActive })
        toast.success('Badge ajouté')
      }
      onClose()
    } catch (err) { setError(parseApiError(err)) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{badge ? 'Modifier le badge' : 'Nouveau badge'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-2"><label className="text-sm font-medium">Nom</label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex : Nageur" autoFocus /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Description</label><Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="space-y-2"><label className="text-xs text-muted-foreground">Code (avancé)</label><Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} className="font-mono text-sm" placeholder="Laissé vide = généré automatiquement" /></div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />Actif</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>{badge ? 'Enregistrer' : 'Ajouter'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
