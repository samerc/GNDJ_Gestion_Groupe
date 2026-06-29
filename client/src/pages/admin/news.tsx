// Admin screen (CG/super-admin, content.manage): public-site news CMS.
// List + create/edit/delete articles authored in a TipTap rich-text editor (with
// inline image upload). Each post is tagged Group / a branch (UnitType) / a single
// Unit, and a publish toggle controls visibility on the public site.
import { useState, useEffect } from 'react'
import { parseApiError } from '@/lib/error-utils'
import {
  useNewsAdmin, useNewsPost, useCreateNews, useUpdateNews, useDeleteNews,
  type NewsPostAdmin, type NewsFormData,
} from '@/services/news-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { useUnits } from '@/services/unit-service'
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
import { Plus, Pencil, Trash2, Newspaper, ImagePlus, Paperclip, X, FileText } from 'lucide-react'
import { toast } from 'sonner'

const emptyForm: NewsFormData = { title: '', bodyHtml: '', isPublished: false, tagType: 'Group', tagUnitTypeId: null, tagUnitId: null, coverImagePath: null, attachments: [] }

export default function AdminNewsPage() {
  const { data: posts, isLoading } = useNewsAdmin()
  const { data: unitTypes } = useUnitTypes({ pageSize: 100 })
  const { data: units } = useUnits({ pageSize: 200 })
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<NewsPostAdmin | null>(null)
  const [form, setForm] = useState<NewsFormData>(emptyForm)
  const [error, setError] = useState('')
  const [coverUploading, setCoverUploading] = useState(false)
  const [attachUploading, setAttachUploading] = useState(false)

  // Full post body is fetched lazily only when editing (the list DTO omits bodyHtml).
  const { data: editData } = useNewsPost(editingId)
  const createMutation = useCreateNews()
  const updateMutation = useUpdateNews()
  const deleteMutation = useDeleteNews()

  // Populate the form once the edited post's full data arrives.
  useEffect(() => {
    if (editingId && editData) {
      setForm({ title: editData.title, bodyHtml: editData.bodyHtml, isPublished: editData.isPublished, tagType: editData.tagType, tagUnitTypeId: editData.tagUnitTypeId, tagUnitId: editData.tagUnitId, coverImagePath: editData.coverImagePath, attachments: editData.attachments ?? [] })
    }
  }, [editingId, editData])

  // Cover image: upload via the content-image endpoint, store the returned URL on the form.
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setCoverUploading(true)
    try { const url = await uploadContentImage(file); setForm(f => ({ ...f, coverImagePath: url })) }
    catch (err) { toast.error(parseApiError(err)) }
    finally { setCoverUploading(false); e.target.value = '' }
  }

  // Attachment: upload via the content-files endpoint (PDF/image), append { name, url } to the list.
  const handleAttachUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setAttachUploading(true)
    try { const { url, name } = await uploadContentFile(file); setForm(f => ({ ...f, attachments: [...f.attachments, { name, url }] })) }
    catch (err) { toast.error(parseApiError(err)) }
    finally { setAttachUploading(false); e.target.value = '' }
  }

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setError(''); setFormOpen(true) }
  const openEdit = (p: NewsPostAdmin) => { setEditingId(p.id); setForm(emptyForm); setError(''); setFormOpen(true) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Le titre est requis.'); return }
    // TipTap emits an empty doc as "<p></p>" — treat that as no content.
    if (!form.bodyHtml.trim() || form.bodyHtml === '<p></p>') { setError('Le contenu est requis.'); return }
    if (form.tagType === 'UnitType' && !form.tagUnitTypeId) { setError('Choisissez une branche.'); return }
    if (form.tagType === 'Unit' && !form.tagUnitId) { setError('Choisissez une unité.'); return }
    try {
      if (editingId) { await updateMutation.mutateAsync({ id: editingId, ...form }); toast.success('Article modifié') }
      else { await createMutation.mutateAsync(form); toast.success('Article créé') }
      setFormOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Article supprimé'); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Actualités</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nouvel article</Button>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !posts || posts.length === 0 ? (
        <EmptyState icon={Newspaper} title="Aucun article" description="Publiez la première nouvelle du groupe."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Étiquette</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell><Badge variant="outline">{p.tagLabel}</Badge></TableCell>
                  <TableCell><Badge variant={p.isPublished ? 'default' : 'secondary'}>{p.isPublished ? 'Publié' : 'Brouillon'}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(p.publishedAt ?? p.createdAt).toLocaleDateString('fr-FR')}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Tip content="Modifier"><Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button></Tip>
                      <Tip content="Supprimer"><Button variant="ghost" size="icon" onClick={() => setDeleting(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Modifier l'article" : 'Nouvel article'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <RequiredLabel required>Titre</RequiredLabel>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Concerne</label>
                {/* Switching tag type clears both id fields; the matching id picker below is shown conditionally */}
                <Select value={form.tagType} onValueChange={(v) => setForm(f => ({ ...f, tagType: v, tagUnitTypeId: null, tagUnitId: null }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Group">Tout le groupe</SelectItem>
                    <SelectItem value="UnitType">Une branche</SelectItem>
                    <SelectItem value="Unit">Une unité</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.tagType === 'UnitType' && (
                <div className="space-y-2">
                  <RequiredLabel required>Branche</RequiredLabel>
                  <Select value={form.tagUnitTypeId ?? ''} onValueChange={(v) => setForm(f => ({ ...f, tagUnitTypeId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>{unitTypes?.items.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {form.tagType === 'Unit' && (
                <div className="space-y-2">
                  <RequiredLabel required>Unité</RequiredLabel>
                  <Select value={form.tagUnitId ?? ''} onValueChange={(v) => setForm(f => ({ ...f, tagUnitId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>{units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Cover image — shown on the article header + news cards (icon fallback when empty). */}
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
              <RichTextEditor content={form.bodyHtml} onChange={(html) => setForm(f => ({ ...f, bodyHtml: html }))} placeholder="Rédigez l'article…"
                onImageUpload={(file) => uploadContentImage(file).catch((e) => { toast.error(parseApiError(e)); throw e })} />
            </div>

            {/* Attachments — downloadable PDF/image files listed on the public article. Name is editable. */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Pièces jointes</label>
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
                {attachUploading ? 'Téléversement…' : <><Paperclip className="h-4 w-4" /><span>Ajouter un fichier (PDF, image)</span></>}
                <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={attachUploading} onChange={handleAttachUpload} />
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
        title="Supprimer l'article"
        description={`Supprimer « ${deleting?.title} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
