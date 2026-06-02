import { parseApiError } from '@/lib/error-utils'
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useDebounce } from '@/hooks/use-debounce'
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit, type UnitDto, type UnitFormData } from '@/services/unit-service'
import { useAssociations } from '@/services/association-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Pencil, Trash2, Search, Building2 } from 'lucide-react'

export default function UnitsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const hasLoadedOnce = useRef(false)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UnitDto | null>(null)
  const [deleting, setDeleting] = useState<UnitDto | null>(null)
  const [form, setForm] = useState<UnitFormData>({ name: '', code: '', associationId: '', unitTypeId: '' })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const { data, isLoading } = useUnits({ search: debouncedSearch || undefined, page })
  const { data: associations } = useAssociations({ pageSize: 100 })
  const { data: unitTypes } = useUnitTypes({ pageSize: 100 })
  const createMutation = useCreateUnit()
  const updateMutation = useUpdateUnit()
  const deleteMutation = useDeleteUnit()

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', code: '', description: '', associationId: '', unitTypeId: '' })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const openEdit = (item: UnitDto) => {
    setEditing(item)
    const assoc = associations?.items.find(a => a.name === item.associationName)
    const ut = unitTypes?.items.find(ut => ut.name === item.unitTypeName)
    setForm({
      name: item.name, code: item.code, description: item.description ?? '',
      associationId: assoc?.id ?? '', unitTypeId: ut?.id ?? '', isActive: item.isActive,
    })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ name: !form.name, code: !form.code, associationId: !form.associationId, unitTypeId: !form.unitTypeId })) return
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...form })
      } else {
        await createMutation.mutateAsync(form)
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
        <h1 className="text-2xl font-bold">Unités</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle unité
        </Button>
      </div>

      {showSearch && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucune unité"
          description={search ? 'Aucun résultat pour cette recherche.' : 'Créez votre première unité.'}
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
                  <TableHead>Association</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Équipes</TableHead>
                  <TableHead className="text-center">Membres</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/units/${item.id}`)}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.code}</TableCell>
                    <TableCell className="text-muted-foreground">{item.associationName}</TableCell>
                    <TableCell className="text-muted-foreground">{item.unitTypeName}</TableCell>
                    <TableCell className="text-center">{item.teamCount}</TableCell>
                    <TableCell className="text-center">{item.memberCount}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? 'default' : 'secondary'}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(item)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'unité" : 'Nouvelle unité'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            <div className="space-y-2">
              <RequiredLabel htmlFor="name" required>Nom</RequiredLabel>
              <Input id="name" className={fieldClass('name')} value={form.name} onChange={(e) => { setForm(f => ({ ...f, name: e.target.value })); clearField('name') }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor="code" required>Code</RequiredLabel>
              <Input id="code" className={fieldClass('code')} value={form.code} onChange={(e) => { setForm(f => ({ ...f, code: e.target.value })); clearField('code') }} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Association</RequiredLabel>
              <Select value={form.associationId} onValueChange={(v) => { setForm(f => ({ ...f, associationId: v })); clearField('associationId') }}>
                <SelectTrigger className={fieldClass('associationId')}><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {associations?.items.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Type d'unité</RequiredLabel>
              <Select value={form.unitTypeId} onValueChange={(v) => { setForm(f => ({ ...f, unitTypeId: v })); clearField('unitTypeId') }}>
                <SelectTrigger className={fieldClass('unitTypeId')}><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>
                  {unitTypes?.items.map(ut => (
                    <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer l'unité"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
