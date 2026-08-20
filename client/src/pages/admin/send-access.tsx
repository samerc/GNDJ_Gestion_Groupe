// "Envoyer les accès" — launch rollout tool. For a chosen unit, shows each active member's login/email
// status and sends an ACTIVATION email (their username + a one-click set-password link). Meant to be run
// unit by unit, starting with the Maîtrise. Row checkboxes let you send to a subset (e.g. resend to a few);
// with none checked, the primary button sends to the whole unit (optionally only those never logged in).
// The app only knows the mail was QUEUED — delivery/bounces live in the SMTP provider's dashboard.
import { useState } from 'react'
import { Key, Send, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { useUnits } from '@/services/unit-service'
import { useAccessCandidates, useSendAccess, type SendAccessResult } from '@/services/member-service'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmailDeliveryWarning } from '@/components/shared/email-delivery-warning'
import { formatDateLong } from '@/lib/utils'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

export default function SendAccessPage() {
  const { data: units } = useUnits({ pageSize: 100, isActive: true })
  const [unitId, setUnitId] = useState<string>('')
  const [onlyNever, setOnlyNever] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<SendAccessResult | null>(null)

  const { data: candidates, isLoading } = useAccessCandidates(unitId || undefined)
  const send = useSendAccess()

  // Reset per-unit UI state in the change handler (not an effect) — keeps selection tied to the unit.
  const onUnitChange = (id: string) => { setUnitId(id); setSelected(new Set()); setResult(null) }

  const eligible = (c: { hasAccount: boolean; hasEmail: boolean }) => c.hasAccount && c.hasEmail
  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const eligibleIds = (candidates ?? []).filter(eligible).map(c => c.memberId)
  const allSelected = eligibleIds.length > 0 && eligibleIds.every(id => selected.has(id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(eligibleIds))

  const handleSend = async () => {
    try {
      // If rows are checked → send to exactly those; otherwise send to the whole unit (respecting the toggle).
      const body = selected.size > 0
        ? { memberIds: [...selected] }
        : { unitId, onlyNeverLoggedIn: onlyNever }
      const res = await send.mutateAsync(body)
      setResult(res)
      setSelected(new Set())
      toast.success(`${res.sent} accès envoyé(s)` + (res.noEmail ? ` · ${res.noEmail} sans email` : '') + (res.noAccount ? ` · ${res.noAccount} sans compte` : ''))
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const unitName = units?.items.find(u => u.id === unitId)?.name ?? ''
  const sendLabel = selected.size > 0 ? `Envoyer aux ${selected.size} sélectionné(s)` : `Envoyer à toute l'unité`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Key className="h-5 w-5 text-primary" />Envoyer les accès</h1>
        <p className="text-sm text-muted-foreground">
          Envoyez à chaque membre son identifiant et un lien pour choisir son mot de passe. Procédez unité par unité,
          en commençant par la Maîtrise.
        </p>
      </div>
      <EmailDeliveryWarning />

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground sm:flex-row sm:items-start">
        <Info className="h-4 w-4 shrink-0 text-primary sm:mt-0.5" />
        <span>
          Le lien d'activation est valable 30 jours. L'application indique seulement que l'email a été <em>envoyé</em> —
          les détails de livraison (reçu, spam, rebond) sont dans le tableau de bord de votre fournisseur SMTP.
        </span>
      </div>

      {/* Unit picker + options */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={unitId} onValueChange={onUnitChange}>
          <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Choisir une unité…" /></SelectTrigger>
          <SelectContent>
            {units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyNever} onCheckedChange={setOnlyNever} />
          Seulement ceux qui ne se sont jamais connectés
        </label>
      </div>

      {!unitId ? (
        <EmptyState icon={Key} title="Choisissez une unité" description="Sélectionnez une unité pour voir ses membres et leur statut d'accès." />
      ) : isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !candidates || candidates.length === 0 ? (
        <EmptyState icon={Key} title="Aucun membre actif" description="Cette unité n'a pas de membre actif." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-10 p-2">
                    <input type="checkbox" className="accent-primary" checked={allSelected} onChange={toggleAll}
                      aria-label="Tout sélectionner" disabled={eligibleIds.length === 0} />
                  </th>
                  <th className="p-2">Membre</th>
                  <th className="p-2">Identifiant</th>
                  <th className="p-2">Email de contact</th>
                  <th className="p-2">Dernière connexion</th>
                  <th className="p-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => {
                  const canSend = eligible(c)
                  return (
                    <tr key={c.memberId} className="border-t hover:bg-muted/30">
                      <td className="p-2">
                        <input type="checkbox" className="accent-primary" disabled={!canSend}
                          checked={selected.has(c.memberId)} onChange={() => toggle(c.memberId)}
                          aria-label={`Sélectionner ${c.memberName}`} />
                      </td>
                      <td className="p-2 font-medium">{c.memberName}</td>
                      <td className="p-2 text-muted-foreground">{c.username ?? '—'}</td>
                      <td className="p-2 text-muted-foreground">{c.contactEmail ?? <span className="text-amber-600">aucun</span>}</td>
                      <td className="p-2 text-muted-foreground">{c.lastLoginAt ? formatDateLong(c.lastLoginAt) : <span className="text-muted-foreground/70">jamais</span>}</td>
                      <td className="p-2">
                        {!c.hasAccount ? (
                          <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />Pas de compte</span>
                        ) : !c.hasEmail ? (
                          <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />Pas d'email</span>
                        ) : c.lastLoginAt ? (
                          <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />Déjà connecté</span>
                        ) : (
                          <span className="text-muted-foreground">Prêt</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {unitName} · {candidates.length} membre(s) · {eligibleIds.length} avec compte + email
            </p>
            <Button onClick={handleSend} disabled={send.isPending}>
              <Send className="mr-2 h-4 w-4" />
              {send.isPending ? 'Envoi…' : sendLabel}
            </Button>
          </div>
        </>
      )}

      {/* Result summary of the last send */}
      {result && (
        <Card>
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="font-medium">Dernier envoi</p>
            <p className="text-green-600">{result.sent} accès envoyé(s)</p>
            {result.skipped > 0 && <p className="text-muted-foreground">{result.skipped} ignoré(s) (déjà connectés)</p>}
            {result.noEmail > 0 && <p className="text-amber-600">{result.noEmail} sans email de contact</p>}
            {result.noAccount > 0 && <p className="text-amber-600">{result.noAccount} sans compte utilisateur</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
