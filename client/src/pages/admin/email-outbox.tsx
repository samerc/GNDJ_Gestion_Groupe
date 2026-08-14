// Admin "Emails — file d'attente / échecs": delivery visibility for the durable email outbox. The sender only
// logs a Warning when a mail gives up, so without this there was no in-app way to notice broken delivery (e.g.
// SMTP misconfigured at go-live: reset/access/broadcast all report "envoyé" = queued, while rows pile up Failed).
// Shows pending/failed/sent counts, lets an admin inspect the last error and requeue failed mail. associations.manage.
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useOutboxEmails, useRetryOutboxEmail, useRetryFailedOutboxEmails, useDeleteOutboxEmail,
  usePurgeSentOutboxEmails, type OutboxEmail,
} from '@/services/email-outbox-service'
import { useDebounce } from '@/hooks/use-debounce'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import {
  Mail, Search, X, RotateCw, Trash2, ChevronDown, ChevronRight, Clock, AlertTriangle, CheckCircle2,
} from 'lucide-react'

function statusBadge(status: string) {
  if (status === 'Sent') return <Badge className="bg-green-100 text-green-700">Envoyé</Badge>
  if (status === 'Failed') return <Badge className="bg-red-100 text-red-700">Échec</Badge>
  return <Badge className="bg-amber-100 text-amber-700">En attente</Badge>
}

function OutboxRow({ entry, idx, onRetry, onDelete, busy }: {
  entry: OutboxEmail; idx: number; onRetry: (id: string) => void; onDelete: (id: string) => void; busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const hasError = !!entry.lastError
  return (
    <>
      <tr className={`border-b align-top ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
        <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString('fr-FR')}</td>
        <td className="px-3 py-2 text-sm break-all">{entry.toEmail}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground break-all">{entry.templateCode}</td>
        <td className="px-3 py-2">{statusBadge(entry.status)}</td>
        <td className="px-3 py-2 text-center text-sm tabular-nums">{entry.attempts}</td>
        <td className="px-3 py-2">
          {hasError ? (
            <button onClick={() => setOpen((o) => !o)} className="flex items-start gap-1 text-left text-xs text-red-600 hover:underline">
              {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span className="line-clamp-1 max-w-[240px]">{entry.lastError}</span>
            </button>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            {entry.status !== 'Sent' && (
              <Tip content="Remettre en file d'attente (renvoyer maintenant)">
                <Button variant="ghost" size="sm" disabled={busy} aria-label="Réessayer" onClick={() => onRetry(entry.id)}>
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
              </Tip>
            )}
            <Tip content="Supprimer de la file">
              <Button variant="ghost" size="sm" disabled={busy} aria-label="Supprimer" className="text-red-600 hover:text-red-700" onClick={() => onDelete(entry.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </Tip>
          </div>
        </td>
      </tr>
      {open && hasError && (
        <tr className="border-b bg-muted/20">
          <td colSpan={7} className="px-3 py-2">
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-muted-foreground">{entry.lastError}</pre>
          </td>
        </tr>
      )}
    </>
  )
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Mail; label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function EmailOutboxPage() {
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  const pageSize = 50

  const effectiveStatus = status === 'all' ? '' : status
  const { data, isLoading, isFetching } = useOutboxEmails(effectiveStatus, debouncedSearch, page, pageSize)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  const retry = useRetryOutboxEmail()
  const retryFailed = useRetryFailedOutboxEmails()
  const del = useDeleteOutboxEmail()
  const purge = usePurgeSentOutboxEmails()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmRetryAll, setConfirmRetryAll] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)

  const handleRetry = (id: string) => {
    setBusyId(id)
    retry.mutate(id, {
      onSuccess: () => toast.success("Email remis en file d'attente"),
      onError: () => toast.error("Impossible de remettre l'email en file d'attente"),
      onSettled: () => setBusyId(null),
    })
  }
  const handleDelete = (id: string) => {
    setBusyId(id)
    del.mutate(id, {
      onSuccess: () => toast.success('Email supprimé de la file'),
      onError: () => toast.error('Impossible de supprimer'),
      onSettled: () => setBusyId(null),
    })
  }
  const handleRetryAll = () =>
    retryFailed.mutate(undefined, {
      onSuccess: (r) => { setConfirmRetryAll(false); toast.success(`${r.count} email(s) remis en file d'attente`) },
      onError: () => toast.error('Échec de la remise en file'),
    })
  const handlePurge = () =>
    purge.mutate(undefined, {
      onSuccess: (r) => { setConfirmPurge(false); toast.success(`${r.count} email(s) envoyé(s) supprimé(s)`) },
      onError: () => toast.error('Échec de la purge'),
    })

  const s = data?.summary

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Emails — file d'attente / échecs</h1>
        <p className="text-sm text-muted-foreground">
          File d'envoi durable des emails. Un email « envoyé » depuis l'application est d'abord <strong>mis en
          file d'attente</strong> ; s'il échoue (SMTP mal configuré, adresse invalide…) il apparaît ici en
          <strong> Échec</strong>. Vous pouvez inspecter l'erreur et le <strong>remettre en file d'attente</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Clock} label="En attente" value={s?.pending ?? 0} tone="bg-amber-100 text-amber-600" />
        <StatCard icon={AlertTriangle} label="Échecs" value={s?.failed ?? 0} tone="bg-red-100 text-red-600" />
        <StatCard icon={CheckCircle2} label="Envoyés" value={s?.sent ?? 0} tone="bg-green-100 text-green-600" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="mr-auto flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-primary" />
              {data ? `${data.total} email${data.total > 1 ? 's' : ''}` : 'Chargement…'}
            </CardTitle>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="failed">Échecs</SelectItem>
                <SelectItem value="sent">Envoyés</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="w-56 pl-8 pr-8" placeholder="Destinataire ou modèle" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
              {search && (
                <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground" aria-label="Effacer">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button variant="outline" size="sm" disabled={!s || s.failed === 0 || retryFailed.isPending} onClick={() => setConfirmRetryAll(true)}>
              <RotateCw className="mr-1.5 h-4 w-4" /> Réessayer les échecs
            </Button>
            <Button variant="outline" size="sm" className="text-muted-foreground" disabled={!s || s.sent === 0 || purge.isPending} onClick={() => setConfirmPurge(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Vider les envoyés
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingSpinner variant="table" />
          ) : !data || data.items.length === 0 ? (
            <EmptyState icon={Mail} title="Aucun email" description="Aucun email ne correspond aux filtres." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Destinataire</th>
                      <th className="px-3 py-2 font-medium">Modèle</th>
                      <th className="px-3 py-2 font-medium">Statut</th>
                      <th className="px-3 py-2 text-center font-medium">Essais</th>
                      <th className="px-3 py-2 font-medium">Dernière erreur</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((e, i) => (
                      <OutboxRow key={e.id} entry={e} idx={i} onRetry={handleRetry} onDelete={handleDelete} busy={busyId === e.id} />
                    ))}
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
        open={confirmRetryAll} onOpenChange={setConfirmRetryAll}
        title="Réessayer tous les emails en échec ?"
        description={`Les ${s?.failed ?? 0} email(s) en échec seront remis en file d'attente et renvoyés. Assurez-vous d'abord que le serveur SMTP est correctement configuré.`}
        confirmLabel="Réessayer" loading={retryFailed.isPending} onConfirm={handleRetryAll}
      />
      <ConfirmDialog
        open={confirmPurge} onOpenChange={setConfirmPurge}
        title="Vider les emails envoyés ?"
        description={`Supprime définitivement les ${s?.sent ?? 0} email(s) déjà envoyé(s) de la file (nettoyage). Les emails en attente et en échec sont conservés.`}
        confirmLabel="Vider" variant="destructive" loading={purge.isPending} onConfirm={handlePurge}
      />
    </div>
  )
}
