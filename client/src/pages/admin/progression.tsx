import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useFormValidation } from '@/hooks/use-form-validation'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useScoutStages, useCreateScoutStage, useUpdateScoutStage, useDeleteScoutStage, useReorderScoutStages, type ScoutStageDto, type ScoutStageFormData } from '@/services/progression-service'
import { useBadges, useCreateBadge, useUpdateBadge, useDeleteBadge, useReorderBadges, type BadgeDto, type BadgeFormData } from '@/services/progression-service'
import { useUnitTypes as useUnitTypesQuery } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Pencil, Trash2, Award, Star, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function ProgressionPage() {
  const { data: unitTypesData } = useUnitTypesQuery({ pageSize: 100 })
  const unitTypes = unitTypesData?.items.map(ut => ({ id: ut.id, name: ut.name })) ?? []
  const [unitTypeFilter, setUnitTypeFilter] = useState<string>('')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Progression scoute</h1>
        <Select value={unitTypeFilter || '_all'} onValueChange={(v) => setUnitTypeFilter(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Tous les types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tous les types d'unité</SelectItem>
            {unitTypes.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages"><Star className="mr-1 h-4 w-4" />Étapes scoutes</TabsTrigger>
          <TabsTrigger value="badges"><Award className="mr-1 h-4 w-4" />Badges</TabsTrigger>
        </TabsList>
        <TabsContent value="stages"><StagesTab unitTypeId={unitTypeFilter || undefined} unitTypes={unitTypes} /></TabsContent>
        <TabsContent value="badges"><BadgesTab unitTypeId={unitTypeFilter || undefined} unitTypes={unitTypes} /></TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Sortable row wrapper ────────────────────
function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="border-b"
    >
      <td className="px-2 py-2 w-8">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      {children}
    </tr>
  )
}

// ─── Stages Tab ──────────────────────────────
export function StagesTab({ unitTypeId, unitTypes }: { unitTypeId?: string; unitTypes: { id: string; name: string }[] }) {
  const { data, isLoading } = useScoutStages(unitTypeId)
  const createMutation = useCreateScoutStage()
  const updateMutation = useUpdateScoutStage()
  const deleteMutation = useDeleteScoutStage()
  const reorderMutation = useReorderScoutStages()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ScoutStageDto | null>(null)
  const [deleting, setDeleting] = useState<ScoutStageDto | null>(null)
  const [form, setForm] = useState<ScoutStageFormData>({ unitTypeId: '', code: '', name: '', description: '', displayOrder: 0, isActive: true, isBadgeStage: false })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const openCreate = () => {
    setEditing(null)
    setForm({ unitTypeId: unitTypeId ?? '', code: '', name: '', description: '', displayOrder: 0, isActive: true, isBadgeStage: false })
    setError(''); clearAll(); setFormOpen(true)
  }

  const openEdit = (item: ScoutStageDto) => {
    setEditing(item)
    setForm({ unitTypeId: item.unitTypeId, code: item.code, name: item.name, description: item.description ?? '', displayOrder: item.displayOrder, isActive: item.isActive, isBadgeStage: item.isBadgeStage })
    setError(''); clearAll(); setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (!validate({ code: !form.code, name: !form.name, unitTypeId: !form.unitTypeId })) return
    try {
      if (editing) await updateMutation.mutateAsync({ id: editing.id, ...form })
      else await createMutation.mutateAsync({ ...form, displayOrder: (data?.length ?? 0) })
      setFormOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!data) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = data.findIndex(s => s.id === active.id)
    const newIndex = data.findIndex(s => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(data, oldIndex, newIndex)
    reorderMutation.mutate(reordered.map(s => s.id))
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouvelle étape</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : !data || data.length === 0 ? (
        <EmptyState icon={Star} title="Aucune étape" description="Créez les étapes de progression pour chaque type d'unité." action={<Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Créer</Button>} />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="w-8" />
                <th className="px-3 py-2 text-left font-medium">Type d'unité</th>
                <th className="px-3 py-2 text-left font-medium">Code</th>
                <th className="px-3 py-2 text-left font-medium">Nom</th>
                <th className="px-3 py-2 text-left font-medium">Options</th>
                <th className="px-3 py-2 text-center font-medium">Utilisations</th>
                <th className="w-24" />
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={data.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {data.map(item => (
                    <SortableRow key={item.id} id={item.id}>
                      <td className="px-3 py-2 text-muted-foreground">{item.unitTypeName}</td>
                      <td className="px-3 py-2 font-medium">{item.code}</td>
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {item.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
                          {item.isBadgeStage && <Badge variant="outline">Badge</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{item.progressionCount}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(item)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </td>
                    </SortableRow>
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Modifier l\'étape' : 'Nouvelle étape'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            {!editing && unitTypes.length > 1 && (
              <div className="space-y-2">
                <RequiredLabel required>Type d'unité</RequiredLabel>
                <Select value={form.unitTypeId} onValueChange={(v) => { setForm(f => ({ ...f, unitTypeId: v })); clearField('unitTypeId') }}>
                  <SelectTrigger className={fieldClass('unitTypeId')}><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>{unitTypes.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><RequiredLabel required>Code</RequiredLabel><Input className={fieldClass('code')} value={form.code} onChange={(e) => { setForm(f => ({ ...f, code: e.target.value })); clearField('code') }} required /></div>
              <div className="space-y-2"><RequiredLabel required>Nom</RequiredLabel><Input className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required /></div>
            </div>
            <div className="space-y-2"><RequiredLabel>Description</RequiredLabel><Input value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value || null }))} /></div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />Actif</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isBadgeStage} onChange={(e) => setForm(f => ({ ...f, isBadgeStage: e.target.checked }))} />Étape de type badge</label>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Supprimer l'étape" description={`Supprimer « ${deleting?.name} » ?`} confirmLabel="Supprimer" variant="destructive" loading={deleteMutation.isPending} onConfirm={handleDelete} />
    </div>
  )
}

// ─── Badges Tab ──────────────────────────────
export function BadgesTab({ unitTypeId, unitTypes }: { unitTypeId?: string; unitTypes: { id: string; name: string }[] }) {
  const { data, isLoading } = useBadges(unitTypeId)
  const createMutation = useCreateBadge()
  const updateMutation = useUpdateBadge()
  const deleteMutation = useDeleteBadge()
  const reorderMutation = useReorderBadges()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BadgeDto | null>(null)
  const [deleting, setDeleting] = useState<BadgeDto | null>(null)
  const [form, setForm] = useState<BadgeFormData>({ unitTypeId: '', code: '', name: '', description: '', displayOrder: 0, isActive: true })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const openCreate = () => {
    setEditing(null)
    setForm({ unitTypeId: unitTypeId ?? '', code: '', name: '', description: '', displayOrder: 0, isActive: true })
    setError(''); clearAll(); setFormOpen(true)
  }

  const openEdit = (item: BadgeDto) => {
    setEditing(item)
    setForm({ unitTypeId: item.unitTypeId, code: item.code, name: item.name, description: item.description ?? '', displayOrder: item.displayOrder, isActive: item.isActive })
    setError(''); clearAll(); setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (!validate({ code: !form.code, name: !form.name, unitTypeId: !form.unitTypeId })) return
    try {
      if (editing) await updateMutation.mutateAsync({ id: editing.id, ...form })
      else await createMutation.mutateAsync({ ...form, displayOrder: (data?.length ?? 0) })
      setFormOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!data) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = data.findIndex(b => b.id === active.id)
    const newIndex = data.findIndex(b => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(data, oldIndex, newIndex)
    reorderMutation.mutate(reordered.map(b => b.id))
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouveau badge</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : !data || data.length === 0 ? (
        <EmptyState icon={Award} title="Aucun badge" description="Créez les badges pour chaque type d'unité." action={<Button onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Créer</Button>} />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="w-8" />
                <th className="px-3 py-2 text-left font-medium">Type d'unité</th>
                <th className="px-3 py-2 text-left font-medium">Code</th>
                <th className="px-3 py-2 text-left font-medium">Nom</th>
                <th className="px-3 py-2 text-left font-medium">Statut</th>
                <th className="px-3 py-2 text-center font-medium">Utilisations</th>
                <th className="w-24" />
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={data.map(b => b.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {data.map(item => (
                    <SortableRow key={item.id} id={item.id}>
                      <td className="px-3 py-2 text-muted-foreground">{item.unitTypeName}</td>
                      <td className="px-3 py-2 font-medium">{item.code}</td>
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{item.progressionCount}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(item)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </td>
                    </SortableRow>
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Modifier le badge' : 'Nouveau badge'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            {!editing && unitTypes.length > 1 && (
              <div className="space-y-2">
                <RequiredLabel required>Type d'unité</RequiredLabel>
                <Select value={form.unitTypeId} onValueChange={(v) => { setForm(f => ({ ...f, unitTypeId: v })); clearField('unitTypeId') }}>
                  <SelectTrigger className={fieldClass('unitTypeId')}><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>{unitTypes.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><RequiredLabel required>Code</RequiredLabel><Input className={fieldClass('code')} value={form.code} onChange={(e) => { setForm(f => ({ ...f, code: e.target.value })); clearField('code') }} required /></div>
              <div className="space-y-2"><RequiredLabel required>Nom</RequiredLabel><Input className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required /></div>
            </div>
            <div className="space-y-2"><RequiredLabel>Description</RequiredLabel><Input value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value || null }))} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />Actif</label>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} title="Supprimer le badge" description={`Supprimer « ${deleting?.name} » ?`} confirmLabel="Supprimer" variant="destructive" loading={deleteMutation.isPending} onConfirm={handleDelete} />
    </div>
  )
}
