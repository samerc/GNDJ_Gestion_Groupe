// Admin screen (CG/super-admin, content.manage): public-site heritage library CMS (Ressources).
// List + create/edit/delete resources authored in a TipTap rich-text editor (with inline image upload).
// Each resource has a category (Chant/Technique/Nœud/Badge/Biographie/Document), free-text tags, a cover
// image, mp3/PDF/image attachments, and a publish toggle controlling visibility on the public library.
import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import {
  useResourcesAdmin, useResource, useCreateResource, useUpdateResource, useDeleteResource,
  categoryLabel, RESOURCE_CATEGORIES, type ResourceAdmin, type ResourceFormData,
} from '@/services/resources-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RichTextEditor } from '@/components/shared/rich-text-editor'
import { uploadContentImage, uploadContentFile } from '@/services/content-image-service'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Tip } from '@/components/ui/tooltip'
import { Plus, Pencil, Trash2, Library, ImagePlus, Paperclip, X, FileText } from 'lucide-react'
import { toast } from 'sonner'

const emptyForm: ResourceFormData = { title: '', bodyHtml: '', category: 'Chant', tags: null, coverImagePath: null, isPublished: false, attachments: [] }

export default function AdminResourcesPage() {
  const { data: resources, isLoading } = useResourcesAdmin()
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ResourceAdmin | null>(null)
  const [form, setForm] = useState<ResourceFormData>(emptyForm)
  const [error, setError] = useState('')
  const [coverUploading, setCoverUploading] = useState(false)
  const [attachUploading, setAttachUploading] = useState(false)

  const { data: editData } = useResource(editingId)
  const createMutation = useCreateResource()
  const updateMutation = useUpdateResource()
  const deleteMutation = useDeleteResource()

  // Populate the form once the edited resource's full data arrives (render-phase reset).
  const [prevEditData, setPrevEditData] = useState(editData)
  if (editData !== prevEditData) {
    setPrevEditData(editData)
    if (editingId && editData) {
      setForm({ title: editData.title, bodyHtml: editData.bodyHtml, category: editData.category, tags: editData.tags, coverImagePath: editData.coverImagePath, isPublished: editData.isPublished, attachments: editData.attachments ?? [] })
    }
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setCoverUploading(true)
    try { const url = await uploadContentImage(file); setForm(f => ({ ...f, coverImagePath: url })) }
    catch (err) { toast.error(parseApiError(err)) }
    finally { setCoverUploading(false); e.target.value = '' }
  }

  // Attachment: upload via the content-files endpoint (mp3/PDF/image), append { name, url } to the list.
  const handleAttachUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setAttachUploading(true)
    try { const { url, name } = await uploadContentFile(file); setForm(f => ({ ...f, attachments: [...f.attachments, { name, url }] })) }
    catch (err) { toast.error(parseApiError(err)) }
    finally { setAttachUploading(false); e.target.value = '' }
  }

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setError(''); setFormOpen(true) }
  const openEdit = (r: ResourceAdmin) => { setEditingId(r.id); setForm(emptyForm); setError(''); setFormOpen(true) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Le titre est requis.'); return }
    if (!form.bodyHtml.trim() || form.bodyHtml === '<p></p>') { setError('Le contenu est requis.'); return }
    try {
      if (editingId) { await updateMutation.mutateAsync({ id: editingId, ...form }); toast.success('Ressource modifiée') }
      else { await createMutation.mutateAsync(form); toast.success('Ressource créée') }
      setFormOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Ressource supprimée'); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Ressources</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nouvelle ressource</Button>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !resources || resources.length === 0 ? (
        <EmptyState icon={Library} title="Aucune ressource" description="Ajoutez le premier chant, nœud, technique ou document."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell><Badge variant="outline">{categoryLabel(r.category)}</Badge></TableCell>
                  <TableCell><Badge variant={r.isPublished ? 'default' : 'secondary'}>{r.isPublished ? 'Publiée' : 'Brouillon'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Tip content="Modifier"><Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></Tip>
                      <Tip content="Supprimer"><Button variant="ghost" size="icon" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingId ? 'Modifier la ressource' : 'Nouvelle ressource'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <RequiredLabel required>Titre</RequiredLabel>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel required>Catégorie</RequiredLabel>
                <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RESOURCE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Mots-clés (optionnel)</label>
                <Input value={form.tags ?? ''} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value || null }))} placeholder="feu, veillée, louveteau…" />
                <p className="text-xs text-muted-foreground">Séparés par des virgules — utilisés pour la recherche.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Image de couverture</label>
              {form.coverImagePath ? (
                <div className="relative overflow-hidden rounded-lg border">
                  <img src={form.coverImagePath} alt="" className="h-44 w-full object-cover" />
                  <Button type="button" variant="secondary" size="sm" className="absolute right-2 top-2" onClick={() => setForm(f => ({ ...f, coverImagePath: null }))}>Retirer</Button>
                </div>
              ) : (
                <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-accent/5">
                  {coverUploading ? 'Téléversement…' : <><ImagePlus className="h-5 w-5" /><span>Ajouter une image (JPG, PNG)</span></>}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={coverUploading} onChange={handleCoverUpload} />
                </label>
              )}
            </div>

            <div className="space-y-2">
              <RequiredLabel required>Contenu</RequiredLabel>
              <RichTextEditor content={form.bodyHtml} onChange={(html) => setForm(f => ({ ...f, bodyHtml: html }))} placeholder="Paroles, étapes, description…"
                onImageUpload={(file) => uploadContentImage(file).catch((e) => { toast.error(parseApiError(e)); throw e })} />
            </div>

            {/* Attachments — mp3 (audio for chants) / PDF / images, listed + downloadable on the public page. */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Fichiers (audio MP3, PDF, images)</label>
              {form.attachments.length > 0 && (
                <ul className="space-y-1.5">
                  {form.attachments.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input value={a.name} onChange={(e) => setForm(f => ({ ...f, attachments: f.attachments.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} className="min-w-0 flex-1 bg-transparent outline-none" />
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Voir</a>
                      <button type="button" onClick={() => setForm(f => ({ ...f, attachments: f.attachments.filter((_, j) => j !== i) }))} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent/5">
                {attachUploading ? 'Téléversement…' : <><Paperclip className="h-4 w-4" /><span>Ajouter un fichier (MP3, PDF, image)</span></>}
                <input type="file" accept="audio/mpeg,.mp3,application/pdf,image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={attachUploading} onChange={handleAttachUpload} />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="isPublished" checked={form.isPublished} onChange={(e) => setForm(f => ({ ...f, isPublished: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
              <label htmlFor="isPublished" className="text-sm font-medium">Publier (visible sur le site public)</label>
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
        title="Supprimer la ressource"
        description={`Supprimer « ${deleting?.title} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
