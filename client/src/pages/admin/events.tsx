// Admin screen (CG/super-admin, content.manage): public-site events CMS (Agenda).
// List + create/edit/delete events authored in a TipTap rich-text editor (with inline image upload).
// Each event has a start date (+ optional end date / free-text time / location), a Group/branch/unit
// tag, a cover image, and a publish toggle that controls visibility on the public agenda.
import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import {
  useEventsAdmin, useEvent, useCreateEvent, useUpdateEvent, useDeleteEvent,
  type EventAdmin, type EventFormData,
} from '@/services/events-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { useUnits } from '@/services/unit-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RichTextEditor } from '@/components/shared/rich-text-editor'
import { DateInput } from '@/components/shared/date-input'
import { uploadContentImage } from '@/services/content-image-service'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Tip } from '@/components/ui/tooltip'
import { formatDateLong } from '@/lib/utils'
import { Plus, Pencil, Trash2, CalendarDays, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'

const emptyForm: EventFormData = { title: '', bodyHtml: '', startDate: '', endDate: null, timeLabel: null, location: null, isPublished: false, tagType: 'Group', tagUnitTypeId: null, tagUnitId: null, coverImagePath: null }

export default function AdminEventsPage() {
  const { data: events, isLoading } = useEventsAdmin()
  const { data: unitTypes } = useUnitTypes({ pageSize: 100 })
  const { data: units } = useUnits({ pageSize: 200 })
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<EventAdmin | null>(null)
  const [form, setForm] = useState<EventFormData>(emptyForm)
  const [error, setError] = useState('')
  const [coverUploading, setCoverUploading] = useState(false)

  // Full event body is fetched lazily only when editing (the list DTO omits bodyHtml).
  const { data: editData } = useEvent(editingId)
  const createMutation = useCreateEvent()
  const updateMutation = useUpdateEvent()
  const deleteMutation = useDeleteEvent()

  // Populate the form once the edited event's full data arrives (render-phase reset).
  const [prevEditData, setPrevEditData] = useState(editData)
  if (editData !== prevEditData) {
    setPrevEditData(editData)
    if (editingId && editData) {
      setForm({ title: editData.title, bodyHtml: editData.bodyHtml, startDate: editData.startDate, endDate: editData.endDate, timeLabel: editData.timeLabel, location: editData.location, isPublished: editData.isPublished, tagType: editData.tagType, tagUnitTypeId: editData.tagUnitTypeId, tagUnitId: editData.tagUnitId, coverImagePath: editData.coverImagePath })
    }
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setCoverUploading(true)
    try { const url = await uploadContentImage(file); setForm(f => ({ ...f, coverImagePath: url })) }
    catch (err) { toast.error(parseApiError(err)) }
    finally { setCoverUploading(false); e.target.value = '' }
  }

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setError(''); setFormOpen(true) }
  const openEdit = (ev: EventAdmin) => { setEditingId(ev.id); setForm(emptyForm); setError(''); setFormOpen(true) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Le titre est requis.'); return }
    if (!form.startDate) { setError('La date de début est requise.'); return }
    if (form.endDate && form.endDate < form.startDate) { setError('La date de fin doit être après la date de début.'); return }
    if (!form.bodyHtml.trim() || form.bodyHtml === '<p></p>') { setError('Le contenu est requis.'); return }
    if (form.tagType === 'UnitType' && !form.tagUnitTypeId) { setError('Choisissez une branche.'); return }
    if (form.tagType === 'Unit' && !form.tagUnitId) { setError('Choisissez une unité.'); return }
    try {
      if (editingId) { await updateMutation.mutateAsync({ id: editingId, ...form }); toast.success('Événement modifié') }
      else { await createMutation.mutateAsync(form); toast.success('Événement créé') }
      setFormOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try { await deleteMutation.mutateAsync(deleting.id); toast.success('Événement supprimé'); setDeleting(null) }
    catch (err) { setError(parseApiError(err)); setDeleting(null) }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Agenda</h1>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nouvel événement</Button>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !events || events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Aucun événement" description="Ajoutez le premier événement de l'agenda."
          action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Étiquette</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="font-medium">{ev.title}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateLong(ev.startDate)}{ev.endDate ? ` → ${formatDateLong(ev.endDate)}` : ''}
                  </TableCell>
                  <TableCell><Badge variant="outline">{ev.tagLabel}</Badge></TableCell>
                  <TableCell><Badge variant={ev.isPublished ? 'default' : 'secondary'}>{ev.isPublished ? 'Publié' : 'Brouillon'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Tip content="Modifier"><Button variant="ghost" size="icon" onClick={() => openEdit(ev)}><Pencil className="h-4 w-4" /></Button></Tip>
                      <Tip content="Supprimer"><Button variant="ghost" size="icon" onClick={() => setDeleting(ev)}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
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
          <DialogHeader><DialogTitle>{editingId ? "Modifier l'événement" : 'Nouvel événement'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <RequiredLabel required>Titre</RequiredLabel>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel required>Date de début</RequiredLabel>
                <DateInput value={form.startDate || null} onChange={(iso) => setForm(f => ({ ...f, startDate: iso ?? '' }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date de fin (optionnel)</label>
                <DateInput value={form.endDate} onChange={(iso) => setForm(f => ({ ...f, endDate: iso }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Horaire (optionnel)</label>
                <Input value={form.timeLabel ?? ''} onChange={(e) => setForm(f => ({ ...f, timeLabel: e.target.value || null }))} placeholder="14h00, 9h–17h, toute la journée…" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Lieu (optionnel)</label>
                <Input value={form.location ?? ''} onChange={(e) => setForm(f => ({ ...f, location: e.target.value || null }))} placeholder="Local du groupe, Faraya…" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Concerne</label>
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
              <RequiredLabel required>Description</RequiredLabel>
              <RichTextEditor content={form.bodyHtml} onChange={(html) => setForm(f => ({ ...f, bodyHtml: html }))} placeholder="Décrivez l'événement…"
                onImageUpload={(file) => uploadContentImage(file).catch((e) => { toast.error(parseApiError(e)); throw e })} />
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
        title="Supprimer l'événement"
        description={`Supprimer « ${deleting?.title} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
