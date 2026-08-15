// "Relance documents" (Chef de Groupe) — after the document submission + CU-verification window, email the
// families whose dossier is still incomplete (missing / to correct / to renew). PRIMARY action = one click
// relances a WHOLE unit (all its incomplete members with an email). SECONDARY = expand a unit and relance a
// single member. The page opens on a worklist of every unit that has incomplete dossiers + its count, so the
// CG never has to go member-by-member. One email per member goes out via the durable outbox — the app only
// knows the mail was QUEUED (delivery/bounces live in the SMTP provider's dashboard).
import { useState, Fragment } from 'react'
import { FileWarning, Send, AlertTriangle, Info, ChevronRight, ChevronDown } from 'lucide-react'
import {
  useDocumentReminderSummary, useDocumentReminderCandidates, useSendDocumentReminders,
  type UnitReminderSummary, type SendRemindersResult,
} from '@/services/document-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
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
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmUnit, setConfirmUnit] = useState<UnitReminderSummary | null>(null)
  const [result, setResult] = useState<SendRemindersResult | null>(null)

  const reportToast = (res: SendRemindersResult) =>
    toast.success(`${res.sent} relance(s) envoyée(s)` + (res.noEmail ? ` · ${res.noEmail} sans email` : ''))

  // One-click: relance every incomplete member (with an email) of a whole unit.
  const sendUnit = async (u: UnitReminderSummary) => {
    setConfirmUnit(null)
    try {
      const res = await send.mutateAsync({ unitId: u.unitId })
      setResult(res)
      reportToast(res)
    } catch (e) { toast.error(parseApiError(e)) }
  }

  // Relance a single member (from the expanded unit view).
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
          Relancez en un clic toute une unité (documents manquants ou à corriger), ou dépliez une unité pour
          relancer un membre en particulier. À utiliser après la période de dépôt et de vérification.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground sm:flex-row sm:items-start">
        <Info className="h-4 w-4 shrink-0 text-primary sm:mt-0.5" />
        <span>
          Seules les unités avec au moins un dossier incomplet apparaissent. Un document <em>en attente de
          vérification</em> n'est pas considéré comme manquant. L'application indique seulement que l'email a été
          {' '}<em>envoyé</em> — les détails de livraison sont dans le tableau de bord de votre fournisseur SMTP.
        </span>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !summary || summary.length === 0 ? (
        <EmptyState icon={FileWarning} title="Aucun dossier incomplet" description="Tous les membres actifs ont un dossier complet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Unité</th>
                <th className="p-2">Dossiers incomplets</th>
                <th className="p-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(u => {
                const isOpen = expanded === u.unitId
                const noEmail = u.withEmailCount === 0
                return (
                  <Fragment key={u.unitId}>
                    <tr className="border-t hover:bg-muted/30">
                      <td className="p-2 font-medium">{u.unitName}</td>
                      <td className="p-2 text-muted-foreground">
                        {u.incompleteCount} incomplet{u.incompleteCount > 1 ? 's' : ''}
                        {u.withEmailCount < u.incompleteCount && (
                          <span className="text-amber-600"> · {u.incompleteCount - u.withEmailCount} sans email</span>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" onClick={() => setConfirmUnit(u)} disabled={noEmail || send.isPending}>
                            <Send className="mr-1.5 h-3.5 w-3.5" />Relancer l'unité
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? null : u.unitId)}>
                            {isOpen ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
                            Membres
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={3} className="bg-muted/20 p-0">
                          <UnitMembers unitId={u.unitId} onSend={sendMember} sending={send.isPending} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
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

// Expanded unit view: the incomplete members + their gaps, each with a one-click individual relance.
function UnitMembers({ unitId, onSend, sending }: { unitId: string; onSend: (memberId: string) => void; sending: boolean }) {
  const { data: members, isLoading } = useDocumentReminderCandidates(unitId)
  if (isLoading) return <div className="p-3"><LoadingSpinner variant="table" /></div>
  if (!members || members.length === 0) return <p className="p-3 text-sm text-muted-foreground">Aucun dossier incomplet.</p>
  return (
    <table className="w-full text-sm">
      <tbody>
        {members.map(c => (
          <tr key={c.memberId} className="border-t">
            <td className="p-2 pl-6 font-medium">{c.memberName}</td>
            <td className="p-2 text-muted-foreground">{c.teamName ?? '—'}</td>
            <td className="p-2">
              <div className="flex flex-wrap gap-1">
                {c.gaps.map((g, i) => {
                  const r = REASON[g.reason] ?? { label: g.reason, cls: 'bg-muted text-foreground' }
                  return (
                    <span key={i} className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${r.cls}`}>
                      {g.docTypeName} · {r.label}
                    </span>
                  )
                })}
              </div>
            </td>
            <td className="p-2 text-muted-foreground">{c.contactEmail ?? <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />aucun</span>}</td>
            <td className="p-2 text-right">
              <Button size="sm" variant="outline" disabled={!c.hasEmail || sending} onClick={() => onSend(c.memberId)}>
                <Send className="mr-1.5 h-3.5 w-3.5" />Relancer
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
