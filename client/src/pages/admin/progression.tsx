// Admin "Progression scoute" screen (super-admin / CG). Manages, per unit type, the scout STAGES
// (an ordered, drag-reorderable ladder) and BADGES (a chip grid). A unit-type pill picker at the top
// scopes both. Delete = archive-if-used (a stage/badge held by members is deactivated, not removed);
// the same StagesLadder/BadgesGrid are also embedded on the unit-type detail page.
import { parseApiError } from '@/lib/error-utils'
import { useEffect, useState } from 'react'
import {
  useScoutStages, useCreateScoutStage, useUpdateScoutStage, useDeleteScoutStage, useReorderScoutStages, type ScoutStageDto,
  useBadges, useCreateBadge, useUpdateBadge, useDeleteBadge, type BadgeDto,
} from '@/services/progression-service'
import { useUnitTypes as useUnitTypesQuery } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
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

export default function ProgressionPage() {
  const { data: unitTypesData } = useUnitTypesQuery({ pageSize: 100 })
  const unitTypes = unitTypesData?.items.map(ut => ({ id: ut.id, name: ut.name })) ?? []
  const [selected, setSelected] = useState('')

  // Default to the first unit type once loaded (unit-type-first UX — no all-types jumble).
  useEffect(() => { if (!selected && unitTypes.length) setSelected(unitTypes[0].id) }, [unitTypes, selected])

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
  const [deleting, setDeleting] = useState<ScoutStageDto | null>(null)
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const stages = data ?? []
  const toggleOne = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

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
    reorderMutation.mutate(arrayMove(stages, oldIndex, newIndex).map(s => s.id))
  }

  const toggleActive = async (s: ScoutStageDto) => {
    try {
      await updateMutation.mutateAsync({ id: s.id, unitTypeId: s.unitTypeId, code: s.code, name: s.name, description: s.description, displayOrder: s.displayOrder, isActive: !s.isActive, isBadgeStage: s.isBadgeStage })
    } catch (err) { toast.error(parseApiError(err)) }
  }

  // Inline quick-add: name only — blank code lets the backend auto-slug a unique code per unit type.
  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await createMutation.mutateAsync({ unitTypeId, code: '', name: newName.trim(), description: null, displayOrder: stages.length, isActive: true, isBadgeStage: false })
      setNewName('')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { const res = await deleteMutation.mutateAsync(deleting.id); toast.success(res?.archived ? 'Étape désactivée (utilisée par des membres)' : 'Étape supprimée'); setDeleting(null) }
    catch (err) { toast.error(parseApiError(err)); setDeleting(null) }
  }

  return (
    <div className="mt-4 space-y-4">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <span className="text-sm text-muted-foreground">{selected.size} sélectionnée(s)</span>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Annuler</Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkConfirm(true)}><Trash2 className="mr-1 h-3.5 w-3.5" />Supprimer la sélection</Button>
        </div>
      )}
      {isLoading ? <LoadingSpinner variant="table" /> : stages.length === 0 ? (
        <EmptyState icon={Star} title="Aucune étape" description="Ajoutez la première étape de progression ci-dessous." />
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

      {/* Inline quick-add */}
      <form onSubmit={quickAdd} className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ajouter une étape (ex : 1ère étoile)…" className="max-w-sm" />
        <Button type="submit" disabled={!newName.trim() || createMutation.isPending}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>
      </form>

      <StageEditDialog stage={editing} onClose={() => setEditing(null)} onSave={updateMutation} />
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
          {stage.isBadgeStage && <Badge variant="outline" className="gap-1 text-[10px]"><Award className="h-3 w-3" />Badge</Badge>}
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

function StageEditDialog({ stage, onClose, onSave }: { stage: ScoutStageDto | null; onClose: () => void; onSave: ReturnType<typeof useUpdateScoutStage> }) {
  const [form, setForm] = useState({ name: '', code: '', description: '', isActive: true, isBadgeStage: false })
  const [error, setError] = useState('')
  useEffect(() => {
    if (stage) setForm({ name: stage.name, code: stage.code, description: stage.description ?? '', isActive: stage.isActive, isBadgeStage: stage.isBadgeStage })
  }, [stage])

  const handleSave = async () => {
    if (!stage) return
    if (!form.name.trim()) { setError('Le nom est requis.'); return }
    setError('')
    try {
      await onSave.mutateAsync({ id: stage.id, unitTypeId: stage.unitTypeId, displayOrder: stage.displayOrder, code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null, isActive: form.isActive, isBadgeStage: form.isBadgeStage })
      toast.success('Étape modifiée'); onClose()
    } catch (err) { setError(parseApiError(err)) }
  }

  return (
    <Dialog open={!!stage} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier l'étape</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-2"><label className="text-sm font-medium">Nom</label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Description</label><Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="space-y-2"><label className="text-xs text-muted-foreground">Code (avancé)</label><Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} className="font-mono text-sm" /></div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />Active</label>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={form.isBadgeStage} onCheckedChange={(v) => setForm(f => ({ ...f, isBadgeStage: v }))} />
            <span>Étape avec badge<span className="block text-xs text-muted-foreground">Permet d'attacher un badge lorsqu'un membre atteint cette étape.</span></span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={onSave.isPending}>Enregistrer</Button>
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
  const [deleting, setDeleting] = useState<BadgeDto | null>(null)
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const badges = data ?? []
  const toggleOne = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

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

  // Inline quick-add: name only — blank code lets the backend auto-slug a unique code per unit type.
  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await createMutation.mutateAsync({ unitTypeId, code: '', name: newName.trim(), description: null, displayOrder: badges.length, isActive: true })
      setNewName('')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { const res = await deleteMutation.mutateAsync(deleting.id); toast.success(res?.archived ? 'Badge désactivé (obtenu par des membres)' : 'Badge supprimé'); setDeleting(null) }
    catch (err) { toast.error(parseApiError(err)); setDeleting(null) }
  }

  return (
    <div className="mt-4 space-y-4">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <span className="text-sm text-muted-foreground">{selected.size} sélectionné(s)</span>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Annuler</Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkConfirm(true)}><Trash2 className="mr-1 h-3.5 w-3.5" />Supprimer la sélection</Button>
        </div>
      )}
      {isLoading ? <LoadingSpinner variant="cards" /> : badges.length === 0 ? (
        <EmptyState icon={Award} title="Aucun badge" description="Ajoutez le premier badge ci-dessous." />
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

      <form onSubmit={quickAdd} className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ajouter un badge (ex : Nageur)…" className="max-w-sm" />
        <Button type="submit" disabled={!newName.trim() || createMutation.isPending}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>
      </form>

      <BadgeEditDialog badge={editing} onClose={() => setEditing(null)} onSave={updateMutation} />
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

function BadgeEditDialog({ badge, onClose, onSave }: { badge: BadgeDto | null; onClose: () => void; onSave: ReturnType<typeof useUpdateBadge> }) {
  const [form, setForm] = useState({ name: '', code: '', description: '', isActive: true })
  const [error, setError] = useState('')
  useEffect(() => {
    if (badge) setForm({ name: badge.name, code: badge.code, description: badge.description ?? '', isActive: badge.isActive })
  }, [badge])

  const handleSave = async () => {
    if (!badge) return
    if (!form.name.trim()) { setError('Le nom est requis.'); return }
    setError('')
    try {
      await onSave.mutateAsync({ id: badge.id, unitTypeId: badge.unitTypeId, displayOrder: badge.displayOrder, code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null, isActive: form.isActive })
      toast.success('Badge modifié'); onClose()
    } catch (err) { setError(parseApiError(err)) }
  }

  return (
    <Dialog open={!!badge} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier le badge</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <div className="space-y-2"><label className="text-sm font-medium">Nom</label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Description</label><Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="space-y-2"><label className="text-xs text-muted-foreground">Code (avancé)</label><Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} className="font-mono text-sm" /></div>
          <label className="flex items-center gap-3 text-sm"><Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />Actif</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={onSave.isPending}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
