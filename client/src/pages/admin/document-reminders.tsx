// "Relance documents" — after the document submission + CU-verification window, email the members whose
// dossier is still incomplete a list of exactly what's missing / to correct / to renew. For a chosen unit it
// shows each non-compliant member + their gaps + resolved contact email; row checkboxes send to a subset, or
// with none checked the primary button sends to the whole unit. One email per member goes out via the durable
// outbox. The app only knows the mail was QUEUED — delivery/bounces live in the SMTP provider's dashboard.
import { useState } from 'react'
import { FileWarning, Send, AlertTriangle, Info } from 'lucide-react'
import { useUnits } from '@/services/unit-service'
import { useDocumentReminderCandidates, useSendDocumentReminders, type SendRemindersResult } from '@/services/document-service'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

// Reason key → French label + chip colour. missing = à fournir, rejected = à corriger, expired = à renouveler.
const REASON: Record<string, { label: string; cls: string }> = {
  missing: { label: 'Manquant', cls: 'bg-red-100 text-red-700' },
  rejected: { label: 'À corriger', cls: 'bg-orange-100 text-orange-700' },
  expired: { label: 'À renouveler', cls: 'bg-amber-100 text-amber-700' },
}

export default function DocumentRemindersPage() {
  const { data: units } = useUnits({ pageSize: 100, isActive: true })
  const [unitId, setUnitId] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<SendRemindersResult | null>(null)

  const { data: candidates, isLoading } = useDocumentReminderCandidates(unitId || undefined)
  const send = useSendDocumentReminders()

  // Reset per-unit UI state in the change handler (not an effect) — keeps selection tied to the unit.
  const onUnitChange = (id: string) => { setUnitId(id); setSelected(new Set()); setResult(null) }

  const eligibleIds = (candidates ?? []).filter(c => c.hasEmail).map(c => c.memberId)
  const allSelected = eligibleIds.length > 0 && eligibleIds.every(id => selected.has(id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(eligibleIds))
  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const handleSend = async () => {
    try {
      // Checked rows → send to exactly those; otherwise the whole unit's incomplete members.
      const body = selected.size > 0 ? { memberIds: [...selected] } : { unitId }
      const res = await send.mutateAsync(body)
      setResult(res)
      setSelected(new Set())
      toast.success(`${res.sent} relance(s) envoyée(s)` + (res.noEmail ? ` · ${res.noEmail} sans email` : ''))
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const unitName = units?.items.find(u => u.id === unitId)?.name ?? ''
  const sendLabel = selected.size > 0 ? `Relancer les ${selected.size} sélectionné(s)` : `Relancer toute l'unité`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><FileWarning className="h-5 w-5 text-primary" />Relance documents</h1>
        <p className="text-sm text-muted-foreground">
          Envoyez aux familles dont le dossier est incomplet la liste des documents manquants, à corriger ou à
          renouveler. À utiliser après la période de dépôt et de vérification.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground sm:flex-row sm:items-start">
        <Info className="h-4 w-4 shrink-0 text-primary sm:mt-0.5" />
        <span>
          Les membres dont le dossier est complet n'apparaissent pas. Un document <em>en attente de vérification</em>
          {' '}n'est pas considéré comme manquant. L'application indique seulement que l'email a été <em>envoyé</em> —
          les détails de livraison sont dans le tableau de bord de votre fournisseur SMTP.
        </span>
      </div>

      <Select value={unitId} onValueChange={onUnitChange}>
        <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Choisir une unité…" /></SelectTrigger>
        <SelectContent>
          {units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {!unitId ? (
        <EmptyState icon={FileWarning} title="Choisissez une unité" description="Sélectionnez une unité pour voir les dossiers incomplets." />
      ) : isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !candidates || candidates.length === 0 ? (
        <EmptyState icon={FileWarning} title="Aucun dossier incomplet" description="Tous les membres actifs de cette unité ont un dossier complet." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-10 p-2">
                    <input type="checkbox" className="accent-primary" checked={allSelected} onChange={toggleAll}
                      aria-label="Tout sélectionner" disabled={eligibleIds.length === 0} />
                  </th>
                  <th className="p-2">Membre</th>
                  <th className="p-2">Équipe</th>
                  <th className="p-2">Documents à compléter</th>
                  <th className="p-2">Email de contact</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => (
                  <tr key={c.memberId} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      <input type="checkbox" className="accent-primary" disabled={!c.hasEmail}
                        checked={selected.has(c.memberId)} onChange={() => toggle(c.memberId)}
                        aria-label={`Sélectionner ${c.memberName}`} />
                    </td>
                    <td className="p-2 font-medium">{c.memberName}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {unitName} · {candidates.length} dossier(s) incomplet(s) · {eligibleIds.length} avec email
            </p>
            <Button onClick={handleSend} disabled={send.isPending || eligibleIds.length === 0}>
              <Send className="mr-2 h-4 w-4" />
              {send.isPending ? 'Envoi…' : sendLabel}
            </Button>
          </div>
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
    </div>
  )
}
