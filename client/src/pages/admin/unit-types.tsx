// Admin list screen for Unit Types / branches (super-admin) — e.g. Meute, Troupe, Compagnie.
// Creating and editing both happen on the detail page (/admin/unit-types/:id, id="new" to create), which
// is the single record page: it edits the core fields inline and hosts the functions/stages/badges tabs.
// This screen is just the searchable list + delete.
import { parseApiError } from '@/lib/error-utils'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { useUnitTypes, useDeleteUnitType, type UnitTypeDto } from '@/services/unit-type-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Plus, Trash2, Search, FolderTree, X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'
import { toast } from 'sonner'

// Sortable columns for the Types d'unité list.
type SortKey = 'name' | 'code' | 'years' | 'units'
const SORT_LABELS: Record<SortKey, string> = { name: 'Nom', code: 'Code', years: "Nombre d'années", units: 'Unités' }

// Clickable sort header (module scope so it's a stable component — the React-Compiler eslint rule forbids
// defining components inside render). Shows an up/down arrow on the active column.
function SortHead({ label, k, sortBy, sortDir, onSort, className }: {
  label: string; k: SortKey; sortBy: SortKey; sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void; className?: string
}) {
  const active = sortBy === k
  return (
    <TableHead className={cn('cursor-pointer select-none whitespace-nowrap', className)} onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)
          : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
      </span>
    </TableHead>
  )
}

export default function UnitTypesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [deleting, setDeleting] = useState<UnitTypeDto | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Unit types are a small fixed set (~10), so fetch them all on one page and sort client-side.
  const { data, isLoading } = useUnitTypes({ search: debouncedSearch || undefined, pageSize: 100 })
  const deleteMutation = useDeleteUnitType()

  // Latch so the search box survives a 0-result filter (see associations.tsx).
  const showSearch = !!search || !!(data && data.totalCount > 0)

  const toggleSort = (k: SortKey) => {
    if (sortBy === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(k); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    const items = data?.items ? [...data.items] : []
    const dir = sortDir === 'asc' ? 1 : -1
    items.sort((a, b) => {
      switch (sortBy) {
        case 'code': return dir * a.code.localeCompare(b.code, 'fr')
        case 'years': return dir * ((a.numberOfYears ?? 0) - (b.numberOfYears ?? 0))
        case 'units': return dir * (a.unitCount - b.unitCount)
        default: return dir * a.name.localeCompare(b.name, 'fr')
      }
    })
    return items
  }, [data, sortBy, sortDir])

  const yearsLabel = (n: number | null) => (n ? `${n} an${n > 1 ? 's' : ''}` : '—')

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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {showSearch && (
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {/* Mobile: sort picker (the cards have no clickable headers). Desktop sorts via the table headers. */}
        <div className="flex items-center gap-2 md:hidden">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                <SelectItem key={k} value={k}>Trier par {SORT_LABELS[k].toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tip content={sortDir === 'asc' ? 'Ordre croissant' : 'Ordre décroissant'}>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
              onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} aria-label="Inverser l'ordre">
              {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
          </Tip>
        </div>
      </div>

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
          {/* Desktop: sortable table (hidden on mobile). */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="Nom" k="name" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <SortHead label="Code" k="code" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <SortHead label="Nombre d'années" k="years" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <TableHead>Description</TableHead>
                  <SortHead label="Unités" k="units" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-center" />
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((item) => (
                  // Whole row opens the detail page; the action cell stops propagation so its buttons don't navigate
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/admin/unit-types/${item.id}`)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {item.color && <div className="h-3 w-3 rounded-full shrink-0 border" style={{ backgroundColor: item.color }} />}
                        {item.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.code}</TableCell>
                    <TableCell className="text-muted-foreground">{yearsLabel(item.numberOfYears)}</TableCell>
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

          {/* Mobile: card list (the table's columns don't fit a phone). Tap a card to open the type. */}
          <div className="space-y-2 md:hidden">
            {sorted.map((item) => (
              <div key={item.id} onClick={() => navigate(`/admin/unit-types/${item.id}`)}
                className="cursor-pointer rounded-lg border p-3 active:bg-muted/60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      {item.color && <span className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: item.color }} />}
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{item.code}</span>
                      <span aria-hidden>·</span>
                      <span>{yearsLabel(item.numberOfYears)}</span>
                      <span aria-hidden>·</span>
                      <span>{item.unitCount} unité{item.unitCount > 1 ? 's' : ''}</span>
                    </div>
                    {item.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="-mr-1 shrink-0"
                    onClick={(e) => { e.stopPropagation(); setDeleting(item) }} aria-label="Supprimer">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
