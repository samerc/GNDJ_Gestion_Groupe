import { parseApiError } from '@/lib/error-utils'
import { useState, useRef } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useDocumentTypes, useCreateDocumentType, useUpdateDocumentType, useDeleteDocumentType, type DocumentTypeDto, type DocumentTypeFormData } from '@/services/document-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Search, FileText } from 'lucide-react'
import { toast } from 'sonner'

const defaultForm: DocumentTypeFormData = { name: '', code: '', description: '', requiresExpiry: false, requiresApproval: true, isActive: true, displayOrder: 0 }

export default function DocumentTypesPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const hasLoadedOnce = useRef(false)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentTypeDto | null>(null)
  const [deleting, setDeleting] = useState<DocumentTypeDto | null>(null)
  const [form, setForm] = useState<DocumentTypeFormData>(defaultForm)
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const { data, isLoading } = useDocumentTypes({ search: debouncedSearch || undefined, page })
  const createMutation = useCreateDocumentType()
  const updateMutation = useUpdateDocumentType()
  const deleteMutation = useDeleteDocumentType()

  const openCreate = () => {
    setEditing(null)
    setForm(defaultForm)
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
      setError(parseApiError(err))
      setDeleting(null)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  if (data && data.totalCount > 0) hasLoadedOnce.current = true
  const showSearch = hasLoadedOnce.current || (data && data.totalCount > 0)

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
          <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun type de document"
          description={search ? 'Aucun résultat pour cette recherche.' : 'Créez votre premier type de document.'}
          action={!search && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead className="text-center">Documents</TableHead>
                  <TableHead className="text-center">Ordre</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id} className="even:bg-muted/30">
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.code}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {item.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}
                        {item.requiresExpiry && <Badge variant="outline">Expiration</Badge>}
                        {item.requiresApproval && <Badge variant="outline">Approbation</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{item.documentCount}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{item.displayOrder}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{data.totalCount} résultat{data.totalCount > 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!data.hasPreviousPage} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <span className="flex items-center text-sm text-muted-foreground">Page {data.page} / {data.totalPages}</span>
                <Button variant="outline" size="sm" disabled={!data.hasNextPage} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
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
            <div className="space-y-2">
              <RequiredLabel htmlFor="displayOrder">Ordre d'affichage</RequiredLabel>
              <Input id="displayOrder" type="number" value={form.displayOrder} onChange={(e) => setForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} />
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
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
