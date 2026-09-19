// "Journal" tab on the member fiche (visible to audit.view = CG/admin): the audit trail related to this member —
// direct actions on the member (profile/contact edits, password reset, delegation, super-admin, restore…) and
// actions the member performed themselves (logins, self-service edits, proposals). Clicking a row shows the
// before→after detail. Reuses the shared audit rendering so it matches the admin audit page exactly.
import { useState } from 'react'
import { useMemberAuditLogs, type AuditLogDto } from '@/services/audit-service'
import { actionMeta, entityLabel, entitySummary, parseUserAgent } from '@/lib/audit-format'
import { DiffViewer } from '@/components/admin/audit-diff'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ScrollText, Eye } from 'lucide-react'

export function MemberAuditLog({ memberId }: { memberId: string }) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useMemberAuditLogs(memberId, page)
  const [detail, setDetail] = useState<AuditLogDto | null>(null)

  if (isLoading) return <LoadingSpinner variant="table" />
  if (!data || data.items.length === 0)
    return <EmptyState icon={ScrollText} title="Aucune activité" description="Aucune action enregistrée pour ce membre." />

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Historique des actions concernant ce membre et effectuées par lui. Cliquez une ligne pour voir le détail.
      </p>
      <div className="divide-y rounded-lg border">
        {data.items.map((log) => {
          const info = actionMeta(log.action)
          const summary = entitySummary(log)
          return (
            <button key={log.id} type="button" onClick={() => setDetail(log)}
              className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge variant="secondary" className={info.color}>{info.label}</Badge>
                  <span className="text-sm">{entityLabel(log.entityType)}</span>
                  {summary && <span className="text-xs text-muted-foreground">— {summary}</span>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(log.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {log.userEmail ? ` · par ${log.userEmail}` : ''}
                </div>
              </div>
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )
        })}
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

      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Détail de l'audit</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><span className="text-muted-foreground">Date :</span> {new Date(detail.timestamp).toLocaleString('fr-FR')}</div>
                <div><span className="text-muted-foreground">Utilisateur :</span> {detail.userEmail ?? '—'}</div>
                <div><span className="text-muted-foreground">Action :</span> {actionMeta(detail.action).label}</div>
                <div><span className="text-muted-foreground">Entité :</span> {entityLabel(detail.entityType)}</div>
                <div><span className="text-muted-foreground">IP :</span> {detail.ipAddress ?? '—'}</div>
                <div className="break-words"><span className="text-muted-foreground">Navigateur :</span> <span title={detail.userAgent ?? undefined}>{parseUserAgent(detail.userAgent)}</span></div>
              </div>
              {(detail.oldValues || detail.newValues) && (
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">
                    {detail.oldValues && detail.newValues ? 'Modifications' : detail.oldValues ? 'Valeurs supprimées' : 'Valeurs'}
                  </p>
                  <DiffViewer oldJson={detail.oldValues} newJson={detail.newValues} />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
