import { useMemo, useState } from 'react'
import { useSettingValue } from '@/services/settings-service'
import {
  useDemandesForReview, useUnitOccupancy, useDecideDemande, useSetIntakeQuota, useSendResponses,
  type DemandeReview, type UnitOccupancy,
} from '@/services/demande-admin-service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { Inbox, Check, X, Send, Users2, ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'

function eligible(u: UnitOccupancy, d: DemandeReview): boolean {
  const g = !u.gender || u.gender === 'Mixte' || u.gender === d.gender
  const a = d.age == null || ((u.ageMin == null || d.age >= u.ageMin) && (u.ageMax == null || d.age <= u.ageMax))
  return g && a
}

export default function DemandeValidationPage() {
  const scoutYear = useSettingValue('demande.scout_year') ?? '2026-2027'
  const siblingsTogether = useSettingValue('demande.decide_siblings_together') === 'true'

  const [status, setStatus] = useState('all')
  const [gender, setGender] = useState('all')
  const [classe, setClasse] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [showOccupancy, setShowOccupancy] = useState(true)

  const filters = useMemo(() => ({
    status: status === 'all' ? undefined : status,
    gender: gender === 'all' ? undefined : gender,
    classe: classe || undefined,
    ageMin: ageMin ? Number(ageMin) : undefined,
    ageMax: ageMax ? Number(ageMax) : undefined,
  }), [status, gender, classe, ageMin, ageMax])

  const { data: demandes, isLoading } = useDemandesForReview(scoutYear, filters)
  const { data: occupancy } = useUnitOccupancy(scoutYear)
  const decideMutation = useDecideDemande()
  const sendMutation = useSendResponses()

  const [approveTarget, setApproveTarget] = useState<DemandeReview | null>(null)
  const [declineTarget, setDeclineTarget] = useState<DemandeReview | null>(null)
  const [pickUnit, setPickUnit] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [sendOpen, setSendOpen] = useState(false)

  const list = demandes ?? []
  const pendingSend = list.filter((d) => (d.status === 'Approved' || d.status === 'Declined') && !d.responseSentAt).length
  const undecided = list.filter((d) => d.status === 'Submitted' && !d.responseSentAt).length
  const canSend = pendingSend > 0 && undecided === 0 && status === 'all'

  const occByUnit = useMemo(() => Object.fromEntries((occupancy ?? []).map((u) => [u.unitId, u])), [occupancy])

  const openApprove = (d: DemandeReview) => { setApproveTarget(d); setPickUnit(d.decidedUnitId ?? ''); setDecisionNote(d.decisionNotes ?? '') }
  const openDecline = (d: DemandeReview) => { setDeclineTarget(d); setDecisionNote(d.decisionNotes ?? '') }

  const confirmApprove = async () => {
    if (!approveTarget || !pickUnit) { toast.error('Veuillez choisir une unité.'); return }
    try {
      await decideMutation.mutateAsync({ id: approveTarget.id, status: 'Approved', decidedUnitId: pickUnit, decisionNotes: decisionNote || null })
      toast.success('Demande acceptée (en attente d\'envoi)')
      setApproveTarget(null)
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const confirmDecline = async () => {
    if (!declineTarget) return
    try {
      await decideMutation.mutateAsync({ id: declineTarget.id, status: 'Declined', decisionNotes: decisionNote || null })
      toast.success('Demande refusée (en attente d\'envoi)')
      setDeclineTarget(null)
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const handleSend = async () => {
    try {
      const r = await sendMutation.mutateAsync(scoutYear)
      toast.success(`${r.approved} acceptée(s) converties en membres, ${r.declined} refusée(s) notifiée(s)`)
      setSendOpen(false)
    } catch (err) { toast.error(parseApiError(err)); setSendOpen(false) }
  }

  const statusBadge = (d: DemandeReview) => {
    if (d.responseSentAt) {
      if (d.status === 'Approved') return <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Acceptée (envoyée)</Badge>
      if (d.status === 'Declined') return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Refusée (envoyée)</Badge>
    }
    if (d.status === 'Approved') return <Badge className="bg-green-600/90"><Check className="mr-1 h-3 w-3" />Acceptée</Badge>
    if (d.status === 'Declined') return <Badge variant="destructive"><X className="mr-1 h-3 w-3" />Refusée</Badge>
    return <Badge className="bg-blue-600"><Clock className="mr-1 h-3 w-3" />À étudier</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Demandes d'inscription — {scoutYear}</h1>
          <p className="text-sm text-muted-foreground">{list.length} demande(s) · {pendingSend} décision(s) en attente d'envoi</p>
        </div>
        <Button size="lg" disabled={!canSend || sendMutation.isPending} onClick={() => setSendOpen(true)}>
          <Send className="mr-2 h-4 w-4" />Envoyer les réponses{pendingSend > 0 ? ` (${pendingSend})` : ''}
        </Button>
      </div>

      {status === 'all' && undecided > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>{undecided} demande(s) encore à étudier.</strong> Toutes les demandes doivent être acceptées ou refusées avant de pouvoir envoyer les réponses.</span>
        </div>
      )}
      {status !== 'all' && pendingSend > 0 && undecided === 0 && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Affichez « Toutes » les demandes pour vérifier qu'aucune n'est en attente, puis envoyez les réponses.
        </div>
      )}

      {/* Occupancy panel */}
      <Card>
        <CardHeader className="cursor-pointer py-3" onClick={() => setShowOccupancy((v) => !v)}>
          <CardTitle className="flex items-center gap-2 text-base">
            {showOccupancy ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Users2 className="h-4 w-4" />Capacité des unités (projetée après passage)
          </CardTitle>
        </CardHeader>
        {showOccupancy && (
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left">Unité</th><th className="px-3 py-2">Actuels</th>
                <th className="px-3 py-2">Projeté</th><th className="px-3 py-2">Quota</th>
                <th className="px-3 py-2">Acceptés</th><th className="px-3 py-2">Places restantes</th>
              </tr></thead>
              <tbody>
                {(occupancy ?? []).map((u) => <OccRow key={u.unitId} u={u} scoutYear={scoutYear} />)}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>

      {/* Filters */}
      <Card><CardContent className="flex flex-wrap items-end gap-3 py-4">
        <div className="space-y-1"><label className="text-xs font-medium">Statut</label>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="Submitted">À étudier</SelectItem>
              <SelectItem value="Approved">Acceptées</SelectItem>
              <SelectItem value="Declined">Refusées</SelectItem>
            </SelectContent></Select></div>
        <div className="space-y-1"><label className="text-xs font-medium">Genre</label>
          <Select value={gender} onValueChange={setGender}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="Masculin">Masculin</SelectItem><SelectItem value="Féminin">Féminin</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><label className="text-xs font-medium">Classe</label><Input className="w-28" value={classe} onChange={(e) => setClasse(e.target.value)} placeholder="ex. CE2" /></div>
        <div className="space-y-1"><label className="text-xs font-medium">Âge min</label><Input className="w-20" type="number" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} /></div>
        <div className="space-y-1"><label className="text-xs font-medium">Âge max</label><Input className="w-20" type="number" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} /></div>
      </CardContent></Card>

      {/* List */}
      {isLoading ? <LoadingSpinner variant="cards" /> : list.length === 0 ? (
        <EmptyState icon={Inbox} title="Aucune demande" description="Aucune demande ne correspond aux filtres." />
      ) : (
        <div className="space-y-3">
          {list.map((d) => {
            const locked = !!d.responseSentAt
            return (
              <Card key={d.id}>
                <CardContent className="pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{d.firstName} {d.lastName}</span>
                        <span className="text-sm text-muted-foreground">{d.age != null ? `${d.age} ans` : ''} · {d.gender} · {d.classe}</span>
                        {statusBadge(d)}
                      </div>
                      <div className="text-sm text-muted-foreground">{d.school} · {d.nationality}{d.bloodType ? ` · ${d.bloodType}` : ''}</div>
                      <div className="text-xs text-muted-foreground">Compte : {d.accountEmail}{d.contactName ? ` (${d.contactName})` : ''}</div>
                      {d.guardians.length > 0 && (
                        <div className="text-xs text-muted-foreground">Parents : {d.guardians.map((g) => `${g.relationship} ${g.firstName} ${g.lastName}${g.phoneNumber ? ' ' + g.phoneNumber : ''}`).join(' · ')}</div>
                      )}
                      {d.scoutRelations.length > 0 && (
                        <div className="text-xs text-muted-foreground">Proches scouts : {d.scoutRelations.map((r) => `${r.firstName ?? ''} ${r.lastName ?? ''} (${r.status === 'CurrentInGroup' ? 'notre groupe' : r.status === 'AncienInGroup' ? 'ancien' : r.otherGroupName || 'autre'})`).join(' · ')}</div>
                      )}
                      {d.parentNotes && <div className="rounded-md bg-muted/40 p-2 text-xs">{d.parentNotes}</div>}
                      {siblingsTogether && d.siblings.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-xs font-medium text-amber-700">Fratrie :</span>
                          {d.siblings.map((s) => (
                            <Badge key={s.id} variant="outline" className="text-xs">
                              {s.firstName} — {s.status === 'Approved' ? 'acceptée' : s.status === 'Declined' ? 'refusée' : 'à étudier'}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {d.decidedUnitName && <div className="text-xs text-green-700">→ Unité : {d.decidedUnitName}</div>}
                      {d.decisionNotes && d.status === 'Declined' && <div className="text-xs text-destructive">Motif : {d.decisionNotes}</div>}
                    </div>
                    {!locked && (
                      <div className="flex gap-2">
                        <Button size="sm" variant={d.status === 'Approved' ? 'default' : 'outline'} onClick={() => openApprove(d)}>
                          <Check className="mr-1 h-4 w-4" />Accepter
                        </Button>
                        <Button size="sm" variant={d.status === 'Declined' ? 'destructive' : 'outline'} onClick={() => openDecline(d)}>
                          <X className="mr-1 h-4 w-4" />Refuser
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Approve dialog */}
      <Dialog open={!!approveTarget} onOpenChange={() => setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Accepter — {approveTarget?.firstName} {approveTarget?.lastName}</DialogTitle></DialogHeader>
          {approveTarget && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">{approveTarget.age != null ? `${approveTarget.age} ans` : ''} · {approveTarget.gender}</div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Unité d'affectation</label>
                <Select value={pickUnit} onValueChange={setPickUnit}>
                  <SelectTrigger><SelectValue placeholder="Choisir une unité" /></SelectTrigger>
                  <SelectContent>
                    {(occupancy ?? []).slice().sort((a, b) => Number(eligible(b, approveTarget)) - Number(eligible(a, approveTarget))).map((u) => {
                      const elig = eligible(u, approveTarget)
                      const full = u.quota != null && u.accepted >= u.quota
                      return <SelectItem key={u.unitId} value={u.unitId}>
                        {u.unitCode} — {u.unitName} {elig ? '✓' : ''} · {u.accepted}{u.quota != null ? `/${u.quota}` : ''} {full ? '⚠' : ''}
                      </SelectItem>
                    })}
                  </SelectContent>
                </Select>
                {pickUnit && occByUnit[pickUnit] && (
                  <p className="text-xs text-muted-foreground">
                    Projeté après passage : {occByUnit[pickUnit].projected} · Acceptés ce tour : {occByUnit[pickUnit].accepted}{occByUnit[pickUnit].quota != null ? ` / quota ${occByUnit[pickUnit].quota}` : ''}
                    {occByUnit[pickUnit].quota != null && occByUnit[pickUnit].accepted >= occByUnit[pickUnit].quota! && <span className="text-amber-600"> — quota atteint</span>}
                    {!eligible(occByUnit[pickUnit], approveTarget) && <span className="text-amber-600"> — hors critères genre/âge</span>}
                  </p>
                )}
              </div>
              <div className="space-y-1.5"><label className="text-sm font-medium">Note (optionnel)</label><Input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Annuler</Button>
            <Button onClick={confirmApprove} disabled={decideMutation.isPending}>Accepter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline dialog */}
      <Dialog open={!!declineTarget} onOpenChange={() => setDeclineTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refuser — {declineTarget?.firstName} {declineTarget?.lastName}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motif (optionnel, inclus dans l'email)</label>
            <Input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="Ex. : effectif complet" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmDecline} disabled={decideMutation.isPending}>Refuser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={sendOpen} onOpenChange={setSendOpen}
        title="Envoyer les réponses"
        description={`Ceci va convertir les demandes acceptées en membres (avec identifiants) et notifier toutes les familles concernées. ${pendingSend} décision(s) seront envoyées. Cette action est définitive. Continuer ?`}
        confirmLabel="Envoyer" loading={sendMutation.isPending} onConfirm={handleSend}
      />
    </div>
  )
}

function OccRow({ u, scoutYear }: { u: UnitOccupancy; scoutYear: string }) {
  const setQuota = useSetIntakeQuota()
  const [val, setVal] = useState(u.quota?.toString() ?? '')
  const remaining = u.quota != null ? u.quota - u.accepted : null
  const save = () => {
    const n = Number(val)
    if (Number.isNaN(n) || n < 0) return
    setQuota.mutate({ unitId: u.unitId, scoutYear, quota: n })
  }
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="px-3 py-2"><span className="font-medium">{u.unitCode}</span> <span className="text-muted-foreground">{u.unitName}</span></td>
      <td className="px-3 py-2 text-center">{u.currentActive}</td>
      <td className="px-3 py-2 text-center font-medium">{u.projected}</td>
      <td className="px-3 py-2 text-center">
        <Input className="mx-auto h-8 w-20 text-center" value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} placeholder="—" />
      </td>
      <td className="px-3 py-2 text-center">{u.accepted}</td>
      <td className="px-3 py-2 text-center">
        {remaining == null ? <span className="text-muted-foreground">—</span> :
          <span className={remaining <= 0 ? 'text-amber-600 font-medium' : 'text-green-700'}>{remaining}{remaining <= 0 && <AlertTriangle className="ml-1 inline h-3 w-3" />}</span>}
      </td>
    </tr>
  )
}
