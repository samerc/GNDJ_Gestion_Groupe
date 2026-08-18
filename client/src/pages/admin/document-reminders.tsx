// "Relance documents" (Chef de Groupe) — after the document submission + CU-verification window, email the
// families whose dossier is still incomplete (missing / to correct / to renew). Pick ONE unit at the top, see
// its incomplete members, then relance the WHOLE unit in one click or a single member. Document gaps are shown
// by short CODE (compact when a member has 6-7 docs), coloured by reason (hover = full name). One email per
// member goes out via the durable outbox — the app only knows the mail was QUEUED (delivery/bounces live in the
// SMTP provider's dashboard).
import { useState } from 'react'
import { FileWarning, Send, AlertTriangle, Info } from 'lucide-react'
import {
  useDocumentReminderSummary, useDocumentReminderCandidates, useSendDocumentReminders,
  type UnitReminderSummary, type SendRemindersResult,
} from '@/services/document-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

// Reason key → French label + chip colour. missing = manquant, rejected = à corriger, expired = à renouveler.
const REASON: Record<string, { label: string; cls: string }> = {
  missing: { label: 'Manquant', cls: 'bg-red-100 text-red-700' },
  rejected: { label: 'À corriger', cls: 'bg-orange-100 text-orange-700' },
  expired: { label: 'À renouveler', cls: 'bg-amber-100 text-amber-700' },
}

export default function DocumentRemindersPage() {
  const { data: summary, isLoading } = useDocumentReminderSummary()
  const send = useSendDocumentReminders()
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [confirmUnit, setConfirmUnit] = useState<UnitReminderSummary | null>(null)
  const [result, setResult] = useState<SendRemindersResult | null>(null)

  // Default to the first unit once the summary loads; if the selected unit drops off (all completed), fall back.
  const units = summary ?? []
  if (units.length > 0 && !units.some(u => u.unitId === selectedUnitId)) {
    setSelectedUnitId(units[0].unitId)
  }
  const selectedUnit = units.find(u => u.unitId === selectedUnitId) ?? null

  const { data: members, isLoading: loadingMembers } = useDocumentReminderCandidates(selectedUnitId || undefined)

  const reportToast = (res: SendRemindersResult) =>
    toast.success(`${res.sent} relance(s) envoyée(s)` + (res.noEmail ? ` · ${res.noEmail} sans email` : ''))

  // One-click: relance every incomplete member (with an email) of the selected unit.
  const sendUnit = async (u: UnitReminderSummary) => {
    setConfirmUnit(null)
    try {
      const res = await send.mutateAsync({ unitId: u.unitId })
      setResult(res)
      reportToast(res)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  // Relance a single member.
  const sendMember = async (memberId: string) => {
    try {
      const res = await send.mutateAsync({ memberIds: [memberId] })
      setResult(res)
      reportToast(res)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><FileWarning className="h-5 w-5 text-primary" />Relance documents</h1>
        <p className="text-sm text-muted-foreground">
          Choisissez une unité, puis relancez-la en un clic (documents manquants ou à corriger) ou relancez un
          membre en particulier. À utiliser après la période de dépôt et de vérification.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground sm:flex-row sm:items-start">
        <Info className="h-4 w-4 shrink-0 text-primary sm:mt-0.5" />
        <span>
          Seules les unités avec au moins un dossier incomplet apparaissent. Un document <em>en attente de
          vérification</em> n'est pas considéré comme manquant. Les documents sont indiqués par leur <em>code</em>
          {' '}(survolez pour le nom complet). L'application indique seulement que l'email a été <em>envoyé</em> — les
          détails de livraison sont dans le tableau de bord de votre fournisseur SMTP.
        </span>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : units.length === 0 ? (
        <EmptyState icon={FileWarning} title="Aucun dossier incomplet" description="Tous les membres actifs ont un dossier complet." />
      ) : (
        <>
          {/* Unit picker + one-click "relance whole unit" */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <label className="text-sm font-medium">Unité</label>
            <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
              <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Choisir une unité" /></SelectTrigger>
              <SelectContent>
                {units.map(u => (
                  <SelectItem key={u.unitId} value={u.unitId}>
                    {u.unitName} · {u.incompleteCount} incomplet{u.incompleteCount > 1 ? 's' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedUnit && (
              <>
                <span className="text-sm text-muted-foreground">
                  {selectedUnit.incompleteCount} incomplet{selectedUnit.incompleteCount > 1 ? 's' : ''}
                  {selectedUnit.withEmailCount < selectedUnit.incompleteCount && (
                    <span className="text-amber-600"> · {selectedUnit.incompleteCount - selectedUnit.withEmailCount} sans email</span>
                  )}
                </span>
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={selectedUnit.withEmailCount === 0 || send.isPending}
                  onClick={() => setConfirmUnit(selectedUnit)}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />Relancer l'unité ({selectedUnit.withEmailCount})
                </Button>
              </>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 px-1 text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">Documents :</span>
            {Object.values(REASON).map(r => (
              <span key={r.label} className="inline-flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 ${r.cls}`}>CODE</span>{r.label}
              </span>
            ))}
          </div>

          {/* Selected unit's incomplete members */}
          {loadingMembers ? (
            <LoadingSpinner variant="table" />
          ) : !members || members.length === 0 ? (
            <EmptyState icon={FileWarning} title="Aucun dossier incomplet" description="Cette unité n'a plus de dossier incomplet." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2">Membre</th>
                    <th className="p-2">Équipe</th>
                    <th className="p-2">Documents</th>
                    <th className="p-2">Email de contact</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(c => (
                    <tr key={c.memberId} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-medium">{c.memberName}</td>
                      <td className="p-2 text-muted-foreground">{c.teamName ?? '—'}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {c.gaps.map((g, i) => {
                            const r = REASON[g.reason] ?? { label: g.reason, cls: 'bg-muted text-foreground' }
                            return (
                              <Tip key={i} content={`${g.docTypeName} — ${r.label}`}>
                                <span className={`inline-flex cursor-help items-center rounded px-1.5 py-0.5 text-xs font-medium ${r.cls}`}>
                                  {g.docTypeCode || g.docTypeName}
                                </span>
                              </Tip>
                            )
                          })}
                        </div>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {c.contactEmail ?? <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />aucun</span>}
                      </td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="outline" disabled={!c.hasEmail || send.isPending} onClick={() => sendMember(c.memberId)}>
                          <Send className="mr-1.5 h-3.5 w-3.5" />Relancer
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="font-medium">Dernier envoi</p>
            <p className="text-green-600">{result.sent} relance(s) envoyée(s)</p>
            {result.compliant > 0 && <p className="text-muted-foreground">{result.compliant} ignoré(s) (dossier déjà complet)</p>}
            {result.noEmail > 0 && <p className="text-amber-600">{result.noEmail} sans email de contact</p>}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!confirmUnit}
        onOpenChange={(o) => !o && setConfirmUnit(null)}
        title="Relancer toute l'unité ?"
        description={confirmUnit
          ? `Envoyer une relance aux ${confirmUnit.withEmailCount} famille(s) de « ${confirmUnit.unitName} » ayant un email. Chaque email liste les documents manquants ou à corriger du membre.`
          : ''}
        confirmLabel="Envoyer les relances"
        loading={send.isPending}
        onConfirm={() => confirmUnit && sendUnit(confirmUnit)}
      />
    </div>
  )
}
