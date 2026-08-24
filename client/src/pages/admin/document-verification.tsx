import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { calendarScoutYear } from '@/hooks/use-scout-year'
import {
  useDocumentCampaignAdmin, useUpdateDocumentCampaign, useSendCampaignErrors,
  useApplyCampaignHold, useOnHoldMembers, useReactivateMember,
  CAMPAIGN_PHASE_LABELS,
} from '@/services/documents-campaign-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RequiredLabel } from '@/components/shared/required-label'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { CalendarClock, Mail, Ban, RotateCcw, CheckCircle2, Clock, Save, Users } from 'lucide-react'

// CG "Vérification des documents" — the group-wide campaign console. Set the schedule (dates), watch the phase +
// per-unit completion, and run the two steps (error emails / on-hold) manually if the CU verification wasn't
// finished by the transition date (else a daily job does it automatically). Plus the on-hold list + reactivation.

function frDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
}

// A metric tile in the "Étape en cours" grid (module scope so it isn't recreated each render).
function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className={`text-2xl font-bold ${tone ?? ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// A date field is stored/sent as yyyy-MM-dd (what <input type="date"> uses) or '' when unset.
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <RequiredLabel>{label}</RequiredLabel>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

// `embedded` = rendered inside the merged "Suivi des documents" page (whose title/tabs own the header), so the
// page's own h1 + description are suppressed to avoid a double header.
export default function DocumentVerificationPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { data, isLoading } = useDocumentCampaignAdmin()
  const update = useUpdateDocumentCampaign()
  const sendErrors = useSendCampaignErrors()
  const applyHold = useApplyCampaignHold()
  const { data: onHold } = useOnHoldMembers()
  const reactivate = useReactivateMember()

  // Config form — seeded from the loaded status once (render-phase sync, no effect).
  const [form, setForm] = useState<null | {
    enabled: boolean; scoutYear: string;
    depositStart: string; depositDeadline: string; correctionStart: string; correctionDeadline: string; finalDeadline: string;
  }>(null)
  const [seededFrom, setSeededFrom] = useState<string | null>(null)
  if (data && seededFrom !== JSON.stringify(data.status)) {
    const s = data.status
    setSeededFrom(JSON.stringify(s))
    setForm({
      enabled: s.enabled,
      scoutYear: s.scoutYear || calendarScoutYear(),
      depositStart: s.depositStart ?? '', depositDeadline: s.depositDeadline ?? '',
      correctionStart: s.correctionStart ?? '', correctionDeadline: s.correctionDeadline ?? '', finalDeadline: s.finalDeadline ?? '',
    })
  }

  const [confirmErrors, setConfirmErrors] = useState(false)
  const [confirmHold, setConfirmHold] = useState(false)

  if (isLoading || !data || !form) return <LoadingSpinner variant="page" />

  const status = data.status
  const phaseLabel = CAMPAIGN_PHASE_LABELS[status.phase] ?? status.phase

  const save = async () => {
    try {
      await update.mutateAsync(form)
      toast.success('Campagne enregistrée')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const doSendErrors = async () => {
    try {
      const r = await sendErrors.mutateAsync()
      toast.success(`Emails d'erreur envoyés — ${r.sent} envoyé(s)${r.noEmail ? `, ${r.noEmail} sans email` : ''}`)
    } catch (err) { toast.error(parseApiError(err)) }
    finally { setConfirmErrors(false) }
  }

  const doApplyHold = async () => {
    try {
      const r = await applyHold.mutateAsync()
      toast.success(`${r.held} dossier(s) mis en attente${r.emailed ? `, ${r.emailed} email(s) envoyé(s)` : ''}`)
    } catch (err) { toast.error(parseApiError(err)) }
    finally { setConfirmHold(false) }
  }

  const doReactivate = async (memberId: string, name: string) => {
    try { await reactivate.mutateAsync(memberId); toast.success(`${name} réactivé(e)`) }
    catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">Vérification des documents</h1>
          <p className="text-sm text-muted-foreground">
            Campagne annuelle : le dépôt ouvre/ferme automatiquement selon les dates ; les emails d'erreur et la mise en attente
            partent automatiquement quand la vérification est terminée, sinon vous êtes alerté et lancez l'étape ci-dessous.
          </p>
        </div>
      )}

      {/* Current phase + progress */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" />Étape en cours</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{status.enabled ? phaseLabel : 'Campagne inactive'}</span>
            {status.enabled && status.uploadOpen && <span className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />Dépôt ouvert</span>}
            {status.enabled && !status.uploadOpen && status.phase !== 'Inactive' && <span className="flex items-center gap-1 text-sm text-amber-600"><Clock className="h-4 w-4" />Dépôt fermé</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="À vérifier (en attente)" value={data.pendingReviewCount} tone={data.pendingReviewCount > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            <Stat label="Dossiers incomplets" value={data.incompleteCount} tone={data.incompleteCount > 0 ? 'text-red-600' : 'text-emerald-600'} />
            <Stat label="Membres en attente" value={data.onHoldCount} tone={data.onHoldCount > 0 ? 'text-red-600' : ''} />
            <Stat label="Vérification" value={data.verificationDone ? 'Terminée' : 'En cours'} tone={data.verificationDone ? 'text-emerald-600 text-lg' : 'text-amber-600 text-lg'} />
          </div>

          {/* Manual steps */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setConfirmErrors(true)} disabled={!status.enabled || sendErrors.isPending}>
              <Mail className="mr-1.5 h-4 w-4" />Envoyer les emails d'erreur{data.errorsSent ? ' (déjà envoyés)' : ''}
            </Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmHold(true)} disabled={!status.enabled || applyHold.isPending}>
              <Ban className="mr-1.5 h-4 w-4" />Mettre les incomplets en attente{data.holdApplied ? ' (déjà fait)' : ''}
            </Button>
          </div>
          {!data.verificationDone && (
            <p className="text-xs text-amber-600">
              La vérification n'est pas terminée ({data.pendingReviewCount} document(s) encore en attente de revue). L'étape automatique attend que toutes les unités aient terminé ; vous pouvez néanmoins lancer une étape manuellement.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Calendrier</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm">Campagne active</span>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm(f => f && ({ ...f, enabled: v }))} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <RequiredLabel required>Année scoute</RequiredLabel>
              <Input value={form.scoutYear} onChange={(e) => setForm(f => f && ({ ...f, scoutYear: e.target.value }))} placeholder="2026-2027" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <DateField label="1. Ouverture du dépôt" value={form.depositStart} onChange={(v) => setForm(f => f && ({ ...f, depositStart: v }))} />
            <DateField label="2. Date limite de dépôt (→ vérification)" value={form.depositDeadline} onChange={(v) => setForm(f => f && ({ ...f, depositDeadline: v }))} />
            <DateField label="3. Ouverture de la correction (→ emails)" value={form.correctionStart} onChange={(v) => setForm(f => f && ({ ...f, correctionStart: v }))} />
            <DateField label="4. Date limite de correction (→ re-vérification)" value={form.correctionDeadline} onChange={(v) => setForm(f => f && ({ ...f, correctionDeadline: v }))} />
            <DateField label="5. Date finale (→ mise en attente)" value={form.finalDeadline} onChange={(v) => setForm(f => f && ({ ...f, finalDeadline: v }))} />
          </div>
          <p className="text-xs text-muted-foreground">
            Le dépôt est <strong>ouvert</strong> pendant le Dépôt (1→2) et la Correction (3→4), <strong>fermé</strong> pendant les vérifications.
            Les dates doivent se suivre dans l'ordre. La mise à jour du calendrier prend effet immédiatement.
          </p>
          <div className="flex justify-end">
            <Button onClick={save} disabled={update.isPending}><Save className="mr-1.5 h-4 w-4" />{update.isPending ? 'Enregistrement…' : 'Enregistrer le calendrier'}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-unit completion */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Avancement par unité</CardTitle></CardHeader>
        <CardContent>
          {data.units.length === 0 ? (
            <p className="text-sm text-muted-foreground">Toutes les unités sont à jour (aucun document en attente, aucun dossier incomplet).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-3 py-2 font-medium">Unité</th>
                    <th className="px-3 py-2 text-center font-medium">À vérifier</th>
                    <th className="px-3 py-2 text-center font-medium">Incomplets</th>
                  </tr>
                </thead>
                <tbody>
                  {data.units.map((u, i) => (
                    <tr key={u.unitId} className={`border-b ${i % 2 ? 'bg-muted/10' : ''}`}>
                      <td className="px-3 py-2 font-medium">{u.unitName}</td>
                      <td className="px-3 py-2 text-center">
                        {u.pendingCount > 0 ? <span className="font-semibold text-amber-600">{u.pendingCount}</span> : <span className="text-emerald-600">✓</span>}
                      </td>
                      <td className="px-3 py-2 text-center">{u.incompleteCount > 0 ? <span className="text-red-600">{u.incompleteCount}</span> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* On-hold members */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Ban className="h-4 w-4" />Membres en attente ({onHold?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {!onHold || onHold.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Aucun membre en attente" description="Aucun dossier n'a été mis en attente." />
          ) : (
            <div className="divide-y rounded-md border">
              {onHold.map(m => (
                <div key={m.memberId} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.unitName ?? '—'}{m.onHoldAt ? ` · depuis le ${frDate(m.onHoldAt)}` : ''}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => doReactivate(m.memberId, m.name)} disabled={reactivate.isPending}>
                    <RotateCcw className="mr-1.5 h-4 w-4" />Réactiver
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog open={confirmErrors} onOpenChange={setConfirmErrors}
        title="Envoyer les emails d'erreur"
        description={`Un email listant les documents manquants / à corriger / à renouveler sera envoyé à chaque membre dont le dossier est incomplet (${data.incompleteCount} membre(s)). Continuer ?`}
        confirmLabel="Envoyer" loading={sendErrors.isPending} onConfirm={doSendErrors} />
      <ConfirmDialog open={confirmHold} onOpenChange={setConfirmHold}
        title="Mettre les dossiers incomplets en attente" variant="destructive"
        description={`Chaque membre dont le dossier est encore incomplet (${data.incompleteCount} membre(s)) sera mis « en attente » : le dépôt de documents lui sera désactivé et un email l'informera de contacter la maîtrise de groupe. Vous pourrez les réactiver individuellement. Continuer ?`}
        confirmLabel="Mettre en attente" loading={applyHold.isPending} onConfirm={doApplyHold} />
    </div>
  )
}
