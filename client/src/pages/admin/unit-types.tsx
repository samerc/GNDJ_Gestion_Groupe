// Admin CRUD screen for Unit Types / branches (super-admin) — e.g. Meute, Troupe, Compagnie.
// Configures the per-branch attributes used app-wide: numberOfYears (also the Camp BP note multiplier),
// ageMin/ageMax (passage age hints), a UNIQUE color (used in functions list + diagrams), and the public
// site description. Rows navigate to the detail page (functions/stages/badges); edit/delete are inline.
import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useDebounce } from '@/hooks/use-debounce'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useUnitTypes, useCreateUnitType, useUpdateUnitType, useDeleteUnitType, type UnitTypeDto, type UnitTypeFormData } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Pencil, Trash2, Search, FolderTree, X } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'

export default function UnitTypesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UnitTypeDto | null>(null)
  const [deleting, setDeleting] = useState<UnitTypeDto | null>(null)
  const [form, setForm] = useState<UnitTypeFormData>({ name: '', code: '' })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass } = useFormValidation()

  const { data, isLoading } = useUnitTypes({ search: debouncedSearch || undefined, page })
  const createMutation = useCreateUnitType()
  const updateMutation = useUpdateUnitType()
  const deleteMutation = useDeleteUnitType()

  // Latch so the search box survives a 0-result filter (see associations.tsx).
  const showSearch = !!search || !!(data && data.totalCount > 0)

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', description: '', numberOfYears: null, ageMin: null, ageMax: null, color: '', publicDescription: '' })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: UnitTypeDto) => {
    setEditing(item)
    setForm({ name: item.name, code: item.code, description: item.description ?? '', numberOfYears: item.numberOfYears, ageMin: item.ageMin, ageMax: item.ageMax, color: item.color ?? '', publicDescription: item.publicDescription ?? '' })
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
        toast.success('Type d\'unité modifié')
      } else {
        await createMutation.mutateAsync(form)
        toast.success('Type d\'unité créé')
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
      toast.success('Type d\'unité supprimé')
      setDeleting(null)
    } catch (err) {
      // The dialog closes on error, so surface it via a toast (a banner inside the dialog wouldn't be seen).
      toast.error(parseApiError(err))
      setDeleting(null)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Types d'unité</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau type
        </Button>
      </div>

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

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Aucun type d'unité"
          description={search ? 'Aucun résultat pour cette recherche.' : "Créez votre premier type d'unité."}
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
                  <TableHead>Nombre d'années</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Unités</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  // Whole row opens the detail page; the action cell stops propagation so its buttons don't navigate
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/admin/unit-types/${item.id}`)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {item.color && <div className="h-3 w-3 rounded-full shrink-0 border" style={{ backgroundColor: item.color }} />}
                        {item.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.code}</TableCell>
                    <TableCell className="text-muted-foreground">{item.numberOfYears ? `${item.numberOfYears} an${item.numberOfYears > 1 ? 's' : ''}` : '—'}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">{item.description ?? '—'}</TableCell>
                    <TableCell className="text-center">{item.unitCount}</TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Tip content="Modifier"><Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button></Tip>
                        <Tip content="Supprimer"><Button variant="ghost" size="icon" onClick={() => setDeleting(item)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button></Tip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

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
            <DialogTitle>{editing ? "Modifier le type d'unité" : "Nouveau type d'unité"}</DialogTitle>
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
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="numberOfYears">Nb d'années</RequiredLabel>
                <Input id="numberOfYears" type="number" min={1} value={form.numberOfYears ?? ''} onChange={(e) => setForm(f => ({ ...f, numberOfYears: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="ageMin">Âge min</RequiredLabel>
                <Input id="ageMin" type="number" min={0} value={form.ageMin ?? ''} onChange={(e) => setForm(f => ({ ...f, ageMin: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="ageMax">Âge max</RequiredLabel>
                <Input id="ageMax" type="number" min={0} value={form.ageMax ?? ''} onChange={(e) => setForm(f => ({ ...f, ageMax: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="color">Couleur</RequiredLabel>
              <div className="flex items-center gap-2">
                <Input id="color" type="color" value={form.color || '#3B82F6'} onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))} className="h-9 w-14 p-1 cursor-pointer" />
                <Input value={form.color || ''} onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#3B82F6" className="flex-1" />
                {form.color && <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setForm(f => ({ ...f, color: '' }))}>Effacer</button>}
              </div>
              <p className="text-xs text-muted-foreground">Chaque type doit avoir une couleur unique.</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="publicDescription" className="text-sm font-medium">Description publique (site)</label>
              <textarea
                id="publicDescription"
                value={form.publicDescription ?? ''}
                onChange={(e) => setForm(f => ({ ...f, publicDescription: e.target.value }))}
                rows={4}
                maxLength={4000}
                placeholder="Présentation de cette branche affichée sur le site public (partagée par toutes les unités de ce type)…"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
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
        title="Supprimer le type d'unité"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ?${deleting?.unitCount ? ` ${deleting.unitCount} unité${deleting.unitCount > 1 ? 's' : ''} de ce type ${deleting.unitCount > 1 ? 'seront affectées' : 'sera affectée'}.` : ''} Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
