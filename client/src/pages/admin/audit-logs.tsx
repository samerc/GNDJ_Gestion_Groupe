import { useState } from 'react'
import { useAuditLogs, useAuditFilterOptions, type AuditLogDto } from '@/services/audit-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ScrollText, Eye } from 'lucide-react'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  Create: { label: 'Création', color: 'bg-green-100 text-green-800' },
  Update: { label: 'Modification', color: 'bg-blue-100 text-blue-800' },
  Delete: { label: 'Suppression', color: 'bg-red-100 text-red-800' },
  Login: { label: 'Connexion', color: 'bg-purple-100 text-purple-800' },
  Logout: { label: 'Déconnexion', color: 'bg-gray-100 text-gray-800' },
}

function formatJson(json: string | null): string {
  if (!json) return '—'
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState<string>('')
  const [action, setAction] = useState<string>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detail, setDetail] = useState<AuditLogDto | null>(null)

  const { data: filters } = useAuditFilterOptions()
  const { data, isLoading } = useAuditLogs({
    entityType: entityType || undefined,
    action: action || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: 30,
  })

  const clearFilters = () => {
    setEntityType('')
    setAction('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Journal d'audit</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Entité</label>
          <Select value={entityType} onValueChange={(v) => { setEntityType(v === '_all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Toutes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Toutes</SelectItem>
              {filters?.entityTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Action</label>
          <Select value={action} onValueChange={(v) => { setAction(v === '_all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Toutes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Toutes</SelectItem>
              {filters?.actions.map(a => <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Du</label>
          <Input type="date" className="w-40" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Au</label>
          <Input type="date" className="w-40" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
        {(entityType || action || from || to) && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>Effacer</Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? <LoadingSpinner /> : !data || data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Aucune entrée" description="Aucun enregistrement d'audit trouvé pour ces filtres." />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Date</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entité</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map(log => {
                  const actionInfo = ACTION_LABELS[log.action]
                  return (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(log)}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-sm">{log.userEmail ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={actionInfo?.color ?? ''}>
                          {actionInfo?.label ?? log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{log.entityType}</span>
                        {log.entityId && <span className="ml-1 text-xs text-muted-foreground">({log.entityId.slice(0, 8)}...)</span>}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détail de l'audit</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Date :</span> {new Date(detail.timestamp).toLocaleString('fr-FR')}</div>
                <div><span className="text-muted-foreground">Utilisateur :</span> {detail.userEmail ?? '—'}</div>
                <div><span className="text-muted-foreground">Action :</span> {ACTION_LABELS[detail.action]?.label ?? detail.action}</div>
                <div><span className="text-muted-foreground">Entité :</span> {detail.entityType}</div>
                <div><span className="text-muted-foreground">ID Entité :</span> <span className="font-mono text-xs">{detail.entityId ?? '—'}</span></div>
                <div><span className="text-muted-foreground">IP :</span> {detail.ipAddress ?? '—'}</div>
              </div>

              {detail.oldValues && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Anciennes valeurs</p>
                  <pre className="rounded-md bg-red-50 p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">{formatJson(detail.oldValues)}</pre>
                </div>
              )}

              {detail.newValues && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Nouvelles valeurs</p>
                  <pre className="rounded-md bg-green-50 p-3 text-xs overflow-auto max-h-48 whitespace-pre-wrap">{formatJson(detail.newValues)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
