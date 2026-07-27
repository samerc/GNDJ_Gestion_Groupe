// Admin screen (CG/super-admin, content.manage): public-site Pages CMS.
// Standalone content pages (one-level parent→child hierarchy) authored in TipTap.
// Pages render as a drag-to-reorder tree: each level is its own dnd-kit context
// (siblings sharing a parentId), and a parent's children nest *inside* its sortable
// row so a parent drags with its sub-pages. showInMenu controls top-nav visibility.
import { useState, useMemo } from 'react'
import { parseApiError } from '@/lib/error-utils'
import {
  usePagesAdmin, usePage, useCreatePage, useUpdatePage, useDeletePage, useReorderPages,
  type PageAdmin, type PageFormData,
} from '@/services/page-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RichTextEditor } from '@/components/shared/rich-text-editor'
import { uploadContentImage } from '@/services/content-image-service'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Tip } from '@/components/ui/tooltip'
import { Plus, Pencil, Trash2, FileText, GripVertical } from 'lucide-react'
import { toast } from 'sonner'

const emptyForm: PageFormData = { title: '', bodyHtml: '', isPublished: false, showInMenu: true, parentId: null }

// One sortable page row (drag handle, slug, status badges, edit/delete) + its nested children block.
function PageRowInner({ page, onEdit, onDelete }: { page: PageAdmin; onEdit: (p: PageAdmin) => void; onDelete: (p: PageAdmin) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
        <Tip content="Glisser pour réordonner"><button type="button" className="cursor-grab text-muted-foreground hover:text-foreground" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button></Tip>
        <span className="flex-1 truncate">
          <span className="font-medium">{page.title}</span>
          <span className="ml-2 text-xs text-muted-foreground">/p/{page.slug}</span>
        </span>
        {!page.parentId && !page.showInMenu && <Badge variant="outline" className="text-muted-foreground">Hors menu</Badge>}
        <Badge variant={page.isPublished ? 'default' : 'secondary'}>{page.isPublished ? 'Publié' : 'Brouillon'}</Badge>
        <Tip content="Modifier"><Button variant="ghost" size="icon" onClick={() => onEdit(page)}><Pencil className="h-4 w-4" /></Button></Tip>
        <Tip content="Supprimer"><Button variant="ghost" size="icon" onClick={() => onDelete(page)}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
      </div>
      {/* Sub-pages nest inside the parent's sortable block, so they move with it */}
      <Children parentId={page.id} onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

// One draggable level (siblings sharing the same parentId).
function Level({ items, parentId, onEdit, onDelete }: {
  items: PageAdmin[]; parentId: string | null
  onEdit: (p: PageAdmin) => void; onDelete: (p: PageAdmin) => void
}) {
  const reorderMutation = useReorderPages()
  const [local, setLocal] = useState(items) // optimistic local order; resynced when the cache updates
  const [prevItems, setPrevItems] = useState(items)
  if (items !== prevItems) { setPrevItems(items); setLocal(items) } // resync on cache update (render-phase)
  // 5px activation distance so clicking the edit/delete buttons doesn't start a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Reorder within this level, then persist the new sibling order (scoped to parentId).
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = local.findIndex(p => p.id === active.id)
    const newIndex = local.findIndex(p => p.id === over.id)
    const reordered = arrayMove(local, oldIndex, newIndex)
    setLocal(reordered)
    reorderMutation.mutate({ parentId, orderedIds: reordered.map(p => p.id) }, { onError: (err) => toast.error(parseApiError(err)) })
  }

  if (items.length === 0) return null
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={local.map(p => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {local.map(p => <PageRowInner key={p.id} page={p} onEdit={onEdit} onDelete={onDelete} />)}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// Indented sub-page level for a given parent (reads from the shared pages cache).
function Children({ parentId, onEdit, onDelete }: { parentId: string; onEdit: (p: PageAdmin) => void; onDelete: (p: PageAdmin) => void }) {
  const { data: pages } = usePagesAdmin()
  const kids = (pages ?? []).filter(p => p.parentId === parentId).sort((a, b) => a.displayOrder - b.displayOrder)
  if (kids.length === 0) return null
  return (
    <div className="ml-7 mt-2 border-l-2 border-border pl-3">
      <Level items={kids} parentId={parentId} onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

export default function AdminPagesPage() {
  const { data: pages, isLoading } = usePagesAdmin()
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<PageAdmin | null>(null)
  const [form, setForm] = useState<PageFormData>(emptyForm)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false) // unsaved-changes guard for the create/edit dialog

  const { data: editData } = usePage(editingId)
  const createMutation = useCreatePage()
  const updateMutation = useUpdatePage()
  const deleteMutation = useDeletePage()

  // Populate the form once the edited page's full data arrives (render-phase reset).
  const [prevEditData, setPrevEditData] = useState(editData)
  if (editData !== prevEditData) {
    setPrevEditData(editData)
    if (editingId && editData) { setForm({ title: editData.title, bodyHtml: editData.bodyHtml, isPublished: editData.isPublished, showInMenu: editData.showInMenu, parentId: editData.parentId }); setDirty(false) }
  }

  // Root pages (no parent) drive the top-level sortable list; children are pulled per-parent in <Children>.
  const topLevel = useMemo(() => (pages ?? []).filter(p => !p.parentId).sort((a, b) => a.displayOrder - b.displayOrder), [pages])
  // Parent options = top-level pages (one level of nesting), excluding the page being edited.
  const parentOptions = topLevel.filter(p => p.id !== editingId)

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setError(''); setDirty(false); setFormOpen(true) }
  // setPrevEditData(undefined) forces the render-phase populate to re-fire even when editData comes back
  // from cache with the SAME reference (re-editing the same page within staleTime) — else the form stays blank.
  const openEdit = (p: PageAdmin) => { setEditingId(p.id); setForm(emptyForm); setPrevEditData(undefined); setError(''); setDirty(false); setFormOpen(true) }

  // Guarded close: warn if there are unsaved edits before discarding the dialog.
  const requestClose = () => {
    if (dirty && !window.confirm('Des modifications non enregistrées seront perdues. Continuer ?')) return
    setFormOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Le titre est requis.'); return }
    // TipTap emits an empty doc as "<p></p>" — treat that as no content.
    if (!form.bodyHtml.trim() || form.bodyHtml === '<p></p>') { setError('Le contenu est requis.'); return }
    try {
      if (editingId) { await updateMutation.mutateAsync({ id: editingId, ...form }); toast.success('Page modifiée') }
      else { await createMutation.mutateAsync(form); toast.success('Page créée') }
      setDirty(false); setFormOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Page supprimée'); setDeleting(null) }
    catch (err) { toast.error(parseApiError(err)); setDeleting(null) }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pages</h1>
          <p className="text-sm text-muted-foreground">Pages de contenu du site public. Glissez-déposez pour réordonner.</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nouvelle page</Button>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !pages || pages.length === 0 ? (
        <EmptyState icon={FileText} title="Aucune page" description="Créez la première page (histoire, méthode, charte…)."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>} />
      ) : (
        <Level items={topLevel} parentId={null} onEdit={openEdit} onDelete={setDeleting} />
      )}

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) requestClose(); else setFormOpen(true) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Modifier la page' : 'Nouvelle page'}</DialogTitle></DialogHeader>
          {/* onChange on the form marks the draft dirty for native inputs (title/checkboxes). */}
          <form onSubmit={handleSubmit} onChange={() => setDirty(true)} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel required>Titre</RequiredLabel>
                <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Page parente</label>
                <Select value={form.parentId ?? '_none'} onValueChange={(v) => { setForm(f => ({ ...f, parentId: v === '_none' ? null : v })); setDirty(true) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Aucune (page principale)</SelectItem>
                    {parentOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Contenu</RequiredLabel>
              <RichTextEditor content={form.bodyHtml} onChange={(html) => { setForm(f => ({ ...f, bodyHtml: html })); setDirty(true) }} placeholder="Rédigez la page…"
                onImageUpload={(file) => uploadContentImage(file).catch((e) => { toast.error(parseApiError(e)); throw e })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="pagePublished" checked={form.isPublished} onChange={(e) => setForm(f => ({ ...f, isPublished: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
              <label htmlFor="pagePublished" className="text-sm font-medium">Publier (visible sur le site public)</label>
            </div>
            {!form.parentId && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="pageShowInMenu" checked={form.showInMenu} onChange={(e) => setForm(f => ({ ...f, showInMenu: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
                <label htmlFor="pageShowInMenu" className="text-sm font-medium">Afficher dans le menu principal</label>
              </div>
            )}
            {!form.parentId && !form.showInMenu && (
              <p className="text-xs text-muted-foreground">Page accessible par son lien (/p/…) mais absente de la barre de menu.</p>
            )}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={requestClose}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer la page"
        description={(() => {
          const base = `Supprimer « ${deleting?.title} » ? Cette action est irréversible.`
          // Warn if this page has sub-pages that would be affected by the deletion.
          const childCount = deleting ? (pages ?? []).filter(p => p.parentId === deleting.id).length : 0
          return childCount > 0
            ? `${base} Cette page a ${childCount} sous-page${childCount > 1 ? 's' : ''} qui ser${childCount > 1 ? 'ont' : 'a'} affectée${childCount > 1 ? 's' : ''}.`
            : base
        })()}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
