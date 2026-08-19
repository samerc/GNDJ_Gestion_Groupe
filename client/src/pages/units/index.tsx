// Units admin list (super-admin). Searchable, paginated table with association + unit-type filters.
// Creating and editing both happen on the unit detail page (/units/:id, id="new" to create) — the single
// record page that edits the core fields + "Site public" block inline and lists the teams. This screen is
// the list + delete only. Association is optional (e.g. Maîtrise de Groupe → "Inter-associations").
import { parseApiError } from '@/lib/error-utils'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useDebounce } from '@/hooks/use-debounce'
import { useUnits, useDeleteUnit, type UnitDto } from '@/services/unit-service'
import { useAssociations } from '@/services/association-service'
import { useUnitTypes } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Trash2, Search, Building2, Eye, X } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'

export default function UnitsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  const [assocFilter, setAssocFilter] = useState('')
  const [utFilter, setUtFilter] = useState('')
  const [deleting, setDeleting] = useState<UnitDto | null>(null)

  const { data, isLoading } = useUnits({ search: debouncedSearch || undefined, associationId: assocFilter || undefined, unitTypeId: utFilter || undefined, page, pageSize: 50 })
  const { data: associations } = useAssociations({ pageSize: 100 })
  const { data: unitTypes } = useUnitTypes({ pageSize: 100 })
  const deleteMutation = useDeleteUnit()

  const openCreate = () => navigate('/units/new')

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      toast.success('Unité supprimée')
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
        <h1 className="text-2xl font-bold">Unités</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle unité
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-9 pr-8" />
          {search && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSearch(''); setPage(1) }}><X className="h-3.5 w-3.5" /></button>}
        </div>
        <Select value={assocFilter || '_all'} onValueChange={(v) => { setAssocFilter(v === '_all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Association" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Toutes les assoc.</SelectItem>
            {associations?.items.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={utFilter || '_all'} onValueChange={(v) => { setUtFilter(v === '_all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Type d'unité" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tous les types</SelectItem>
            {unitTypes?.items.map(ut => <SelectItem key={ut.id} value={ut.id}>{ut.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
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
                    <TableCell className="text-muted-foreground">{item.associationName ?? 'Inter-associations'}</TableCell>
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
                        <Tip content="Voir / modifier"><Button variant="ghost" size="icon" onClick={() => navigate(`/units/${item.id}`)}>
                          <Eye className="h-4 w-4" />
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

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer l'unité"
        description={`Êtes-vous sûr de vouloir supprimer « ${deleting?.name} » ?${(deleting?.teamCount || deleting?.memberCount) ? ` ${deleting?.teamCount ?? 0} équipe${(deleting?.teamCount ?? 0) > 1 ? 's' : ''} et ${deleting?.memberCount ?? 0} membre${(deleting?.memberCount ?? 0) > 1 ? 's' : ''} seront affectés.` : ''} Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
