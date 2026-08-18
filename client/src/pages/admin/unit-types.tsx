// Admin list screen for Unit Types / branches (super-admin) — e.g. Meute, Troupe, Compagnie.
// Creating and editing both happen on the detail page (/admin/unit-types/:id, id="new" to create), which
// is the single record page: it edits the core fields inline and hosts the functions/stages/badges tabs.
// This screen is just the searchable list + delete.
import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useDebounce } from '@/hooks/use-debounce'
import { useUnitTypes, useDeleteUnitType, type UnitTypeDto } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Trash2, Search, FolderTree, X } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'

export default function UnitTypesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<UnitTypeDto | null>(null)

  const { data, isLoading } = useUnitTypes({ search: debouncedSearch || undefined, page })
  const deleteMutation = useDeleteUnitType()

  // Latch so the search box survives a 0-result filter (see associations.tsx).
  const showSearch = !!search || !!(data && data.totalCount > 0)

  const openCreate = () => navigate('/admin/unit-types/new')

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
