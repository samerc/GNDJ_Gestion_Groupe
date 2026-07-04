// Admin CRUD screen for Associations (super-admin only — top of the org hierarchy; a unit may belong
// to one association or none). Standard paginated list + debounced search + create/edit dialog +
// delete confirm. Same shape as the other org-config admin pages (unit-types, document-types).
import { parseApiError } from '@/lib/error-utils'
import { useState, useRef } from 'react'
import { useDebounce } from '@/hooks/use-debounce'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useAssociations, useCreateAssociation, useUpdateAssociation, useDeleteAssociation, type AssociationDto, type AssociationFormData } from '@/services/association-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Pencil, Trash2, Search, Landmark, X } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'

export default function AssociationsPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const hasLoadedOnce = useRef(false)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AssociationDto | null>(null)
  const [deleting, setDeleting] = useState<AssociationDto | null>(null)
  const [form, setForm] = useState<AssociationFormData>({ name: '', code: '' })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass } = useFormValidation()

  const { data, isLoading } = useAssociations({ search: debouncedSearch || undefined, page })
  const createMutation = useCreateAssociation()
  const updateMutation = useUpdateAssociation()
  const deleteMutation = useDeleteAssociation()

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', description: '' })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: AssociationDto) => {
    setEditing(item)
    setForm({ name: item.name, code: item.code, description: item.description ?? '' })
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
        toast.success('Association modifiée')
      } else {
        await createMutation.mutateAsync(form)
        toast.success('Association créée')
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
      toast.success('Association supprimée')
      setDeleting(null)
    } catch (err) {
      setError(parseApiError(err))
      setDeleting(null)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  // Latch once any data has loaded so the search box stays visible even after a search returns 0 rows
  // (otherwise filtering to no results would hide the input the user is typing in).
  if (data && data.totalCount > 0) hasLoadedOnce.current = true
  const showSearch = hasLoadedOnce.current || (data && data.totalCount > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Associations</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle association
        </Button>
      </div>

      {/* Search — only show when items exist */}
      {showSearch && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9 pr-9"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(''); setPage(1) }} aria-label="Effacer la recherche"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Aucune association"
          description={search ? 'Aucun résultat pour cette recherche.' : 'Créez votre première association.'}
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
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Unités</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id} className="even:bg-muted/30">
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.code}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">{item.description ?? '—'}</TableCell>
                    <TableCell className="text-center">{item.unitCount}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Tip content="Modifier">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Tip>
                        <Tip content="Supprimer">
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(item)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </Tip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {data.totalCount} résultat{data.totalCount > 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!data.hasPreviousPage} onClick={() => setPage(p => p - 1)}>
                  Précédent
                </Button>
                <span className="flex items-center text-sm text-muted-foreground">
                  Page {data.page} / {data.totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={!data.hasNextPage} onClick={() => setPage(p => p + 1)}>
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier l\'association' : 'Nouvelle association'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}
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
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer l'association"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
