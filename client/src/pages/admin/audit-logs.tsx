// Admin screen (audit.view = CG/super-admin): read-only audit log viewer.
// Paged, filterable by entity/action/user/date range + free-text search; row click opens a detail dialog
// that renders the old/new JSON snapshots as a friendly before→after table. Exportable to CSV; super-admin
// can clear the trail (which downloads a CSV backup of the deleted rows first).
import { useState, type ReactNode } from 'react'
import { useAuditLogs, useAuditFilterOptions, useClearAuditLogs, useExportAuditLogs, type AuditLogDto, type AuditFilters } from '@/services/audit-service'
import { useAuthStore } from '@/stores/auth-store'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ScrollText, Eye, Trash2, Search, X, Download } from 'lucide-react'
import { useDebounce } from '@/hooks/use-debounce'
import { Tip } from '@/components/ui/tooltip'
import { ACTION_LABELS, ENTITY_LABELS, actionMeta, entityLabel, parseUserAgent, entitySummary } from '@/lib/audit-format'
import { DiffViewer } from '@/components/admin/audit-diff'

// One label-above-value cell for the audit detail dialog. Stacking the label on its own line (instead of an
// inline "Label : value") keeps each field readable on a narrow phone — the value never crams against a
// wrapping label, and long values (GUID / user-agent) get their own full line.
function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words">{children}</div>
    </div>
  )
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState<string>('')
  const [action, setAction] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [detail, setDetail] = useState<AuditLogDto | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false)
  const clearLogs = useClearAuditLogs()
  const exportLogs = useExportAuditLogs()

  // The filters currently applied (shared by the list, the export and — for the range — the search).
  const activeFilters: AuditFilters = {
    entityType: entityType || undefined,
    action: action || undefined,
    userId: userId || undefined,
    from: from || undefined,
    to: to || undefined,
    search: debouncedSearch.trim() || undefined,
  }

  const handleClear = () => {
    clearLogs.mutate(undefined, {
      onSuccess: (r) => { toast.success(`Journal vidé (${r.deleted} entrée${r.deleted > 1 ? 's' : ''}) — sauvegarde CSV téléchargée`); setConfirmClear(false); setPage(1) },
      onError: (e) => toast.error(parseApiError(e)),
    })
  }

  const handleExport = () => {
    exportLogs.mutate(activeFilters, {
      onSuccess: () => toast.success('Export CSV téléchargé'),
      onError: (e) => toast.error(parseApiError(e)),
    })
  }

  const { data: filters } = useAuditFilterOptions()
  const { data, isLoading } = useAuditLogs({ ...activeFilters, page, pageSize: 30 })

  const clearFilters = () => {
    setEntityType(''); setAction(''); setUserId(''); setFrom(''); setTo(''); setSearch(''); setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Journal d'audit</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"
            disabled={!data || data.totalCount === 0 || exportLogs.isPending}
            onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" /> Exporter (CSV)
          </Button>
          {isSuperAdmin && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"
              disabled={!data || data.totalCount === 0 || clearLogs.isPending}
              onClick={() => setConfirmClear(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Vider le journal
            </Button>
          )}
        </div>
      </div>

      {/* Free-text search — matches user, IP, action, entity and the before/after snapshots (accent-insensitive),
          so a member/unit name finds every action touching it. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 pr-9"
          placeholder="Rechercher (nom, unité, email, IP…)"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        {search && (
          <button type="button" onClick={() => { setSearch(''); setPage(1) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Effacer la recherche">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Entité</label>
          {/* '_all' is a sentinel option (Radix Select can't hold an empty value) → mapped back to '' (no filter) */}
          <Select value={entityType} onValueChange={(v) => { setEntityType(v === '_all' ? '' : v); setPage(1) }}>
            <SelectTrigger><SelectValue placeholder="Toutes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Toutes</SelectItem>
              {filters?.entityTypes.map(t => <SelectItem key={t} value={t}>{ENTITY_LABELS[t] ?? t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Action</label>
          <Select value={action} onValueChange={(v) => { setAction(v === '_all' ? '' : v); setPage(1) }}>
            <SelectTrigger><SelectValue placeholder="Toutes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Toutes</SelectItem>
              {filters?.actions.map(a => <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Utilisateur</label>
          <Select value={userId} onValueChange={(v) => { setUserId(v === '_all' ? '' : v); setPage(1) }}>
            <SelectTrigger><SelectValue placeholder="Tous" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Tous</SelectItem>
              {filters?.users.map(u => <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Du</label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Au</label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
        {(entityType || action || userId || from || to || search) && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>Effacer</Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? <LoadingSpinner variant="table" /> : !data || data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Aucune entrée" description="Aucun enregistrement d'audit trouvé pour ces filtres." />
      ) : (
        <>
          <div className="rounded-lg border">
            {/* min-w so the columns scroll horizontally on a phone instead of squishing (email/IP unreadable). */}
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Date</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entité</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map(log => {
                  const info = actionMeta(log.action)
                  return (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50 even:bg-muted/30" onClick={() => setDetail(log)}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-sm">{log.userEmail ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={info.color}>{info.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="text-sm">{entityLabel(log.entityType)}</span>
                          {(() => {
                            const summary = entitySummary(log)
                            return summary ? <span className="ml-1.5 text-xs text-muted-foreground">— {summary}</span> : null
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.ipAddress ?? '—'}</TableCell>
                      <TableCell>
                        <Tip content="Voir le détail">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Tip>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{data.totalCount} entrée{data.totalCount > 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!data.hasPreviousPage} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <span className="flex items-center text-sm text-muted-foreground">Page {data.page} / {data.totalPages}</span>
                <Button variant="outline" size="sm" disabled={!data.hasNextPage} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détail de l'audit</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="Date">{new Date(detail.timestamp).toLocaleString('fr-FR')}</Field>
                <Field label="Utilisateur">{detail.userEmail ?? '—'}</Field>
                <Field label="Action">{actionMeta(detail.action).label}</Field>
                <Field label="Entité">{entityLabel(detail.entityType)}{(() => { const s = entitySummary(detail); return s ? ` — ${s}` : '' })()}</Field>
                <Field label="ID Entité"><span className="font-mono text-xs break-all">{detail.entityId ?? '—'}</span></Field>
                <Field label="IP">{detail.ipAddress ?? '—'}</Field>
                {/* Browser / device string — helpful to troubleshoot a login (which device the attempt came from). */}
                <Field label="Navigateur" className="sm:col-span-2"><span title={detail.userAgent ?? undefined}>{parseUserAgent(detail.userAgent)}</span></Field>
              </div>

              {(detail.oldValues || detail.newValues) && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">
                    {detail.oldValues && detail.newValues ? 'Modifications' : detail.oldValues ? 'Valeurs supprimées' : 'Valeurs'}
                  </p>
                  <DiffViewer oldJson={detail.oldValues} newJson={detail.newValues} />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Vider le journal d'audit ?"
        description="Une sauvegarde CSV des entrées supprimées sera d'abord téléchargée, puis toutes les entrées d'audit seront définitivement supprimées. Cette action est irréversible."
        confirmLabel="Exporter et vider"
        variant="destructive"
        loading={clearLogs.isPending}
        onConfirm={handleClear}
      />
    </div>
  )
}
