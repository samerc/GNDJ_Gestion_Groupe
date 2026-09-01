// Admin screen (super-admin): read-only audit log viewer.
// Paged, filterable by entity/action/date range; row click opens a detail dialog
// that renders the old/new JSON snapshots as a friendly key-value table.
import { useState } from 'react'
import { useAuditLogs, useAuditFilterOptions, useClearAuditLogs, type AuditLogDto } from '@/services/audit-service'
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
import { ScrollText, Eye, Trash2 } from 'lucide-react'
import { Tip } from '@/components/ui/tooltip'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  Create: { label: 'Création', color: 'bg-green-100 text-green-800' },
  Update: { label: 'Modification', color: 'bg-blue-100 text-blue-800' },
  Delete: { label: 'Suppression', color: 'bg-red-100 text-red-800' },
  Login: { label: 'Connexion', color: 'bg-purple-100 text-purple-800' },
  LoginFailed: { label: 'Échec connexion', color: 'bg-orange-100 text-orange-800' },
  Logout: { label: 'Déconnexion', color: 'bg-gray-100 text-gray-800' },
}

const ENTITY_LABELS: Record<string, string> = {
  User: 'Utilisateur',
  ApplicantAccount: "Compte d'inscription",
  Member: 'Membre',
  Unit: 'Unité',
  Team: 'Équipe',
  Association: 'Association',
  UnitType: "Type d'unité",
  FunctionalRole: 'Fonction',
  SecurityProfile: 'Profil de sécurité',
  MemberAssignment: 'Affectation',
  MemberDocument: 'Document',
  MemberCotisation: 'Cotisation',
  DocumentType: 'Type de document',
  Setting: 'Paramètre',
  Guardian: 'Parent',
  GuardianLink: 'Lien parent',
}

// Human labels for the raw snapshot field names, so the detail reads in French instead of PascalCase keys.
const FIELD_LABELS: Record<string, string> = {
  Member: 'Membre', Unit: 'Unité', Team: 'Équipe', Role: 'Fonction',
  StartDate: 'Début', EndDate: 'Fin', Name: 'Nom', Totem: 'Totem', Adjective: 'Adjectif',
  Description: 'Description', Color1: 'Couleur 1', Color2: 'Couleur 2', DisplayOrder: 'Ordre',
  IsMaitrise: 'Maîtrise', Email: 'Email', Code: 'Code', Reason: 'Motif', Title: 'Titre',
  ReceiptNumber: 'Reçu', ScoutYear: 'Année scoute', FirstName: 'Prénom', LastName: 'Nom',
  Portal: 'Portail',
}
const fieldLabel = (k: string) => FIELD_LABELS[k] ?? k

// Renders a stored value readably: booleans → Oui/Non, null/empty → —.
function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  return String(v)
}

// Best-effort human label for a log row, sniffed from the first recognizable field
// in the JSON snapshot (Member → Name → Email → full name → …). Empty if none found.
function entitySummary(log: AuditLogDto): string {
  // Try to extract a meaningful label from newValues or oldValues
  const json = log.newValues || log.oldValues
  if (!json) return ''
  try {
    const obj = JSON.parse(json)
    // Common field patterns
    if (obj.Member) return obj.Member       // assignments (readable member name)
    if (obj.Name) return obj.Name
    if (obj.Email) return obj.Email
    if (obj.Title) return obj.Title
    if (obj.FirstName && obj.LastName) return `${obj.FirstName} ${obj.LastName}`
    if (obj.ReceiptNumber) return obj.ReceiptNumber
    if (obj.Code) return obj.Code
    if (obj.Reason) return obj.Reason
  } catch { /* ignore */ }
  return ''
}

function parseObj(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    const o = JSON.parse(json)
    return typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : null
  } catch { return null }
}

// Combined before→after view. When both snapshots exist it shows one row per field with the old and new value
// side by side, HIGHLIGHTING the ones that actually changed (so a reorder/recolor is obvious instead of looking
// like a no-op). When only one side exists (Create / Delete) it shows a single value column.
function DiffViewer({ oldJson, newJson }: { oldJson: string | null; newJson: string | null }) {
  const oldObj = parseObj(oldJson)
  const newObj = parseObj(newJson)

  // Fall back to raw text if neither parsed into an object (e.g. a scalar or malformed snapshot).
  if (!oldObj && !newObj) {
    const raw = newJson ?? oldJson
    if (!raw) return <span className="text-muted-foreground">—</span>
    return <pre className="rounded-md bg-muted/30 p-3 text-xs overflow-auto whitespace-pre-wrap">{raw}</pre>
  }

  const keys = Array.from(new Set([...Object.keys(oldObj ?? {}), ...Object.keys(newObj ?? {})]))
  const both = oldObj && newObj

  return (
    <div className="rounded-md border text-sm overflow-hidden">
      <div className={`grid ${both ? 'grid-cols-[10rem_1fr_1fr]' : 'grid-cols-[10rem_1fr]'} bg-muted/50 font-medium text-muted-foreground text-xs uppercase`}>
        <div className="px-3 py-1.5">Champ</div>
        {both ? <><div className="px-3 py-1.5">Avant</div><div className="px-3 py-1.5">Après</div></> : <div className="px-3 py-1.5">Valeur</div>}
      </div>
      <div className="divide-y">
        {keys.map((k) => {
          const ov = oldObj?.[k]
          const nv = newObj?.[k]
          const changed = both && formatVal(ov) !== formatVal(nv)
          return (
            <div key={k} className={`grid ${both ? 'grid-cols-[10rem_1fr_1fr]' : 'grid-cols-[10rem_1fr]'} ${changed ? 'bg-amber-50' : ''}`}>
              <div className="px-3 py-1.5 font-medium text-muted-foreground">{fieldLabel(k)}</div>
              {both ? (
                <>
                  <div className={`px-3 py-1.5 break-all ${changed ? 'text-muted-foreground line-through' : ''}`}>{formatVal(ov)}</div>
                  <div className={`px-3 py-1.5 break-all ${changed ? 'font-medium text-amber-800' : ''}`}>{formatVal(nv)}</div>
                </>
              ) : (
                <div className="px-3 py-1.5 break-all">{formatVal(oldObj ? ov : nv)}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState<string>('')
  const [action, setAction] = useState<string>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detail, setDetail] = useState<AuditLogDto | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false)
  const clearLogs = useClearAuditLogs()
  const handleClear = () => {
    clearLogs.mutate(undefined, {
      onSuccess: (r) => { toast.success(`Journal vidé (${r.deleted} entrée${r.deleted > 1 ? 's' : ''})`); setConfirmClear(false); setPage(1) },
      onError: (e) => toast.error(parseApiError(e)),
    })
  }

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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Journal d'audit</h1>
        {isSuperAdmin && (
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"
            disabled={!data || data.totalCount === 0 || clearLogs.isPending}
            onClick={() => setConfirmClear(true)}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Vider le journal
          </Button>
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
          <label className="text-sm text-muted-foreground">Du</label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Au</label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
        {(entityType || action || from || to) && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>Effacer</Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? <LoadingSpinner variant="table" /> : !data || data.items.length === 0 ? (
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
                  <TableHead>IP</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map(log => {
                  const actionInfo = ACTION_LABELS[log.action]
                  return (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50 even:bg-muted/30" onClick={() => setDetail(log)}>
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
                        <div>
                          <span className="text-sm">{ENTITY_LABELS[log.entityType] ?? log.entityType}</span>
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
                <div><span className="text-muted-foreground">Entité :</span> {ENTITY_LABELS[detail.entityType] ?? detail.entityType}{(() => { const s = entitySummary(detail); return s ? ` — ${s}` : '' })()}</div>
                <div><span className="text-muted-foreground">ID Entité :</span> <span className="font-mono text-xs">{detail.entityId ?? '—'}</span></div>
                <div><span className="text-muted-foreground">IP :</span> {detail.ipAddress ?? '—'}</div>
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
        description="Toutes les entrées d'audit seront définitivement supprimées. Cette action est irréversible."
        confirmLabel="Vider"
        variant="destructive"
        loading={clearLogs.isPending}
        onConfirm={handleClear}
      />
    </div>
  )
}
