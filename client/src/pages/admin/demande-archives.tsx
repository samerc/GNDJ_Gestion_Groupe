import { useState } from 'react'
import { useDemandeArchives } from '@/services/demande-admin-service'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Archive, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 50

// CG page — browse the permanent demande archive (past campaigns). Purpose: history + verify a family's claim
// that they applied before. Read-only; search by child name, filter by scout year, paginated.
export default function DemandeArchivesPage() {
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('') // '' = all years
  const [page, setPage] = useState(1)

  const { data, isLoading } = useDemandeArchives(search, year, page, PAGE_SIZE)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  const statusBadge = (a: { status: string }) => {
    if (a.status === 'Approved') return <Badge className="bg-green-600">Acceptée</Badge>
    if (a.status === 'Declined') return <Badge variant="destructive">Refusée</Badge>
    return <Badge variant="secondary">{a.status}</Badge>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Archive className="h-6 w-6" />Archives des demandes</h1>
        <p className="text-sm text-muted-foreground">Historique des demandes des campagnes précédentes (pour vérifier une inscription antérieure).</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 pr-8" placeholder="Rechercher par nom d'enfant…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          {search && (
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setSearch(''); setPage(1) }}><X className="h-4 w-4" /></button>
          )}
        </div>
        <Select value={year || '__all__'} onValueChange={(v) => { setYear(v === '__all__' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Toutes les années" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Toutes les années</SelectItem>
            {data?.scoutYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={Archive} title="Aucune archive" description="Les demandes archivées (après clôture d'une campagne) apparaîtront ici." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enfant</TableHead>
                  <TableHead className="hidden sm:table-cell">Année</TableHead>
                  <TableHead className="hidden md:table-cell">Naissance</TableHead>
                  <TableHead className="hidden lg:table-cell">Parent</TableHead>
                  <TableHead>Résultat</TableHead>
                  <TableHead className="hidden md:table-cell">Unité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((a) => (
                  <TableRow key={a.id} className="even:bg-muted/30">
                    <TableCell>
                      <div className="font-medium">{a.firstName} {a.lastName}</div>
                      <div className="text-xs text-muted-foreground sm:hidden">{a.scoutYear}</div>
                      {a.createdMemberCardNumber && <div className="text-xs text-muted-foreground">Matricule {a.createdMemberCardNumber}</div>}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">{a.scoutYear}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{a.dateOfBirth ?? '—'}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {a.contactName || a.accountEmail || '—'}
                    </TableCell>
                    <TableCell>
                      {statusBadge(a)}
                      {a.status === 'Declined' && a.decisionNotes && <div className="mt-1 max-w-xs text-xs text-muted-foreground">{a.decisionNotes}</div>}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{a.decidedUnitName ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{data.total} demande(s) archivée(s)</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span>Page {page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
