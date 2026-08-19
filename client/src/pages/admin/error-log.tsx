// Super-admin "Journal des erreurs" — browse recent Warning+ application logs (every server error alert's
// reference lands here) so an incident can be diagnosed in-app, without depending on the alert email. Read-only.
import { useState } from 'react'
import { toast } from 'sonner'
import { useErrorLogs, useClearErrorLogs, type ErrorLogEntry } from '@/services/log-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ChevronDown, ChevronRight, Search, X, AlertTriangle, Trash2 } from 'lucide-react'

function levelColor(level: string): string {
  const l = level.toLowerCase()
  if (l === 'error' || l === 'fatal') return 'bg-red-100 text-red-700'
  if (l === 'warning') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

function LogRow({ entry, idx }: { entry: ErrorLogEntry; idx: number }) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!entry.exception
  return (
    <>
      <tr className={`border-b align-top ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
        <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
          {new Date(entry.timestamp).toLocaleString('fr-FR')}
        </td>
        <td className="px-3 py-2"><Badge className={levelColor(entry.level)}>{entry.level}</Badge></td>
        <td className="px-3 py-2">
          <div className="flex items-start gap-1.5">
            {hasDetail ? (
              <button onClick={() => setOpen((o) => !o)} className="mt-0.5 text-muted-foreground hover:text-foreground" aria-label="Détail">
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : <span className="w-4" />}
            <span className="break-words text-sm">{entry.message}</span>
          </div>
        </td>
      </tr>
      {open && hasDetail && (
        <tr className="border-b bg-muted/20">
          <td colSpan={3} className="px-3 py-2">
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-muted-foreground">{entry.exception}</pre>
          </td>
        </tr>
      )}
    </>
  )
}

export default function ErrorLogPage() {
  const [level, setLevel] = useState('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  const pageSize = 50

  const effectiveLevel = level === 'all' ? '' : level
  const { data, isLoading, isFetching } = useErrorLogs(effectiveLevel, debouncedSearch, page, pageSize)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  const clearLogs = useClearErrorLogs()
  const [confirmClear, setConfirmClear] = useState(false)
  const handleClear = () => {
    clearLogs.mutate(undefined, {
      onSuccess: (r) => { setConfirmClear(false); setPage(1); toast.success(`Journal vidé (${r.deleted} entrée${r.deleted > 1 ? 's' : ''} supprimée${r.deleted > 1 ? 's' : ''})`) },
      onError: () => toast.error('Impossible de vider le journal'),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Journal des erreurs</h1>
        <p className="text-sm text-muted-foreground">
          Journaux applicatifs récents (niveau Avertissement et plus). La <strong>référence</strong> affichée aux
          utilisateurs et envoyée par email s'y retrouve.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="mr-auto flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {data ? `${data.total} entrée${data.total > 1 ? 's' : ''}` : 'Chargement…'}
            </CardTitle>
            <Select value={level} onValueChange={(v) => { setLevel(v); setPage(1) }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les niveaux</SelectItem>
                <SelectItem value="Error">Error</SelectItem>
                <SelectItem value="Fatal">Fatal</SelectItem>
                <SelectItem value="Warning">Warning</SelectItem>
                <SelectItem value="Information">Information</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="w-full sm:w-56 pl-8 pr-8" placeholder="Rechercher (message, réf.)" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
              {search && (
                <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground" aria-label="Effacer">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700"
              disabled={!data || data.total === 0 || clearLogs.isPending} onClick={() => setConfirmClear(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Vider le journal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingSpinner variant="table" />
          ) : !data || data.items.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="Aucune entrée" description="Aucun journal ne correspond aux filtres. C'est bon signe !" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Niveau</th>
                      <th className="px-3 py-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((e, i) => <LogRow key={`${e.timestamp}-${i}`} entry={e} idx={i} />)}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Page {page} / {totalPages}{isFetching ? ' …' : ''}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Vider le journal des erreurs ?"
        description={`Cette action supprime définitivement les ${data?.total ?? 0} entrée(s) du journal. Les erreurs futures continueront d'être enregistrées.`}
        confirmLabel="Vider"
        variant="destructive"
        loading={clearLogs.isPending}
        onConfirm={handleClear}
      />
    </div>
  )
}
