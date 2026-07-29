// Admin CRUD screen for Document Types (super-admin) — defines the dynamic document slots members must
// fill (these drive the Ma fiche checklist + the CU documents matrix). Per type: requiresExpiry (member
// must supply an expiry date), requiresApproval (a leader must approve after upload), isActive ("actif
// cette année" — toggles whether it's expected this scout year). The list order is set by drag-and-drop
// (like Étapes/Badges/Pages) and drives the checklist/matrix ordering — no manual order field.
import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useDocumentTypes, useCreateDocumentType, useUpdateDocumentType, useDeleteDocumentType, useReorderDocumentTypes, type DocumentTypeDto, type DocumentTypeFormData } from '@/services/document-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Search, FileText, GripVertical, X } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const defaultForm: DocumentTypeFormData = { name: '', code: '', description: '', requiresExpiry: false, requiresApproval: true, isActive: true, displayOrder: 0 }

export default function DocumentTypesPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentTypeDto | null>(null)
  const [deleting, setDeleting] = useState<DocumentTypeDto | null>(null)
  const [form, setForm] = useState<DocumentTypeFormData>(defaultForm)
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  // Doc types are few — fetch them all (pageSize 100) so the whole set is a single drag-orderable list.
  const { data, isLoading } = useDocumentTypes({ search: debouncedSearch || undefined, page: 1, pageSize: 100 })
  const createMutation = useCreateDocumentType()
  const updateMutation = useUpdateDocumentType()
  const deleteMutation = useDeleteDocumentType()
  const reorderMutation = useReorderDocumentTypes()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Local order copy for a smooth drag (arrayMove locally, then persist). Synced from the query.
  // IMPORTANT: initialize `items` from the (possibly already-cached) query data, NOT []. If the query cache
  // is warm at mount, prevItems === data.items on the first render, so the render-phase resync below is
  // skipped — initializing to [] would then leave the list permanently empty (the "Aucun type" bug).
  const [items, setItems] = useState<DocumentTypeDto[]>(data?.items ?? [])
  const [prevItems, setPrevItems] = useState(data?.items)
  if (data?.items && data.items !== prevItems) { setPrevItems(data.items); setItems(data.items) } // resync from query (render-phase)

  // Dragging only makes sense on the full unfiltered set (a search shows a subset).
  const canReorder = !debouncedSearch

  const openCreate = () => {
    setEditing(null)
    // New types append to the end of the order.
    setForm({ ...defaultForm, displayOrder: data?.totalCount ?? 0 })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: DocumentTypeDto) => {
    setEditing(item)
    setForm({ name: item.name, code: item.code, description: item.description ?? '', requiresExpiry: item.requiresExpiry, requiresApproval: item.requiresApproval, isActive: item.isActive, displayOrder: item.displayOrder })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name, code: !form.code })) return
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...form })
        toast.success('Type de document modifié')
      } else {
        await createMutation.mutateAsync(form)
        toast.success('Type de document créé')
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      toast.success('Type de document supprimé')
      setDeleting(null)
    } catch (err) {
      toast.error(parseApiError(err))
      setDeleting(null)
    }
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(i => i.id === active.id)
    const newIndex = items.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(items, oldIndex, newIndex)
    setItems(next) // optimistic
    reorderMutation.mutate(next.map(i => i.id), { onError: (err) => toast.error(parseApiError(err)) })
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  // Latch so the search box survives a 0-result filter (see associations.tsx).
  const showSearch = !!search || !!(data && data.totalCount > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Types de documents</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau type
        </Button>
      </div>

      {showSearch && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-9" />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun type de document"
          description={debouncedSearch ? 'Aucun résultat pour cette recherche.' : 'Créez votre premier type de document.'}
          action={!debouncedSearch && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>}
        />
      ) : (
        <>
          {canReorder && <p className="text-xs text-muted-foreground">Glissez pour réordonner. Cet ordre s'applique à la checklist « Ma fiche » et au tableau des documents.</p>}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy} disabled={!canReorder}>
              <ul className="space-y-2">
                {items.map((item) => (
                  <SortableTypeRow
                    key={item.id}
                    item={item}
                    canReorder={canReorder}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setDeleting(item)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le type de document' : 'Nouveau type de document'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            {hasErrors && <FormFieldErrors show={hasErrors} />}
            <div className="space-y-2">
              <RequiredLabel htmlFor="name" required>Nom</RequiredLabel>
              <Input id="name" className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="code" required>Code</RequiredLabel>
              <Input id="code" className={fieldClass('code')} value={form.code} onChange={(e) => { setForm(f => ({ ...f, code: e.target.value })); clearField('code') }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="description">Description</RequiredLabel>
              <Input id="description" value={form.description ?? ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value || null }))} />
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                Actif cette année
              </label>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.requiresExpiry} onChange={(e) => setForm(f => ({ ...f, requiresExpiry: e.target.checked }))} />
                  Date d'expiration requise
                </label>
                <p className="text-xs text-muted-foreground ml-6">Le membre devra fournir une date d'expiration lors de l'envoi</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.requiresApproval} onChange={(e) => setForm(f => ({ ...f, requiresApproval: e.target.checked }))} />
                  Approbation requise
                </label>
                <p className="text-xs text-muted-foreground ml-6">Un responsable devra approuver le document après envoi</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer le type de document"
        description={(deleting?.documentCount ?? 0) > 0
          ? `« ${deleting?.name} » est utilisé par ${deleting?.documentCount} document(s). Vous ne pouvez pas le supprimer — désactivez-le plutôt (décochez « Actif cette année »).`
          : `Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ? Cette action est irréversible.`}
        confirmLabel={(deleting?.documentCount ?? 0) > 0 ? 'Désactiver…' : 'Supprimer'}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={(deleting?.documentCount ?? 0) > 0 ? () => { const d = deleting; setDeleting(null); if (d) openEdit(d) } : handleDelete}
      />
    </div>
  )
}

// A single draggable document-type row (grip handle + name/code + option badges + doc count + actions).
function SortableTypeRow({ item, canReorder, onEdit, onDelete }: { item: DocumentTypeDto; canReorder: boolean; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !canReorder })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-3 rounded-lg border bg-card p-3', isDragging && 'shadow-lg')}>
      {canReorder ? (
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing" aria-label="Déplacer">
          <GripVertical className="h-4 w-4" />
        </button>
      ) : <span className="w-4" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {item.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
          {item.requiresExpiry && <Badge variant="outline">Expiration</Badge>}
          {item.requiresApproval && <Badge variant="outline">Approbation</Badge>}
        </div>
      </div>
      <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">{item.documentCount} document{item.documentCount > 1 ? 's' : ''}</span>
      <div className="flex gap-1">
        <Tip content="Modifier"><Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button></Tip>
        <Tip content="Supprimer"><Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
      </div>
    </li>
  )
}
