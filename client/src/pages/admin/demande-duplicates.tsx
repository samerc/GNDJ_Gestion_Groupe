// CG page: merge duplicate demandes (the same child submitted more than once). Detection is server-side
// (same name + date of birth, this scout year, not yet converted/sent). For each group the CG picks a keeper;
// identical fields are merged automatically, differing ones are shown as a choice, and parents/proches are
// ticked item-by-item. On confirm the loser demande(s) — and any now-empty applicant account — are deleted,
// with an optional email to the accounts. Group-manager only (route gated on demande.manage).
import { useMemo, useState } from 'react'
import { useCampaignStatus, useDuplicateDemandes, useMergeDemandes, type DemandeReview, type DuplicateDemandeGroup, type DemandeMergeFields } from '@/services/demande-admin-service'
import type { ApplicantGuardian, ApplicantScoutRelation } from '@/services/applicant-service'
import { formatPhoneDisplay } from '@/components/ui/phone-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { Users, GitMerge, Check } from 'lucide-react'

// ── small helpers ──────────────────────────────────────────────────────────────────────────────────
const S = (v: string | null | undefined) => (v ?? '').trim()
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—')
const dash = (v: string | null | undefined) => (S(v) ? v! : '—')
const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
const norm = (v: string | null | undefined) => S(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Signature used to collapse IDENTICAL parents/proches into one row (so they're auto-merged, not shown twice).
const guardianSig = (g: ApplicantGuardian) => `${norm(g.firstName)} ${norm(g.lastName)}|${digits(g.phoneNumber)}|${norm(g.email)}`
const relationSig = (r: ApplicantScoutRelation) =>
  `${r.status}|${r.relatedMemberId ?? ''}|${norm(r.firstName)} ${norm(r.lastName)}|${norm(r.otherGroupName)}|${norm(r.lastUnit)}`

const guardianLabel = (g: ApplicantGuardian) => {
  const phone = formatPhoneDisplay(g.phoneCountryCode, g.phoneNumber)
  return [`${g.relationship} : ${S(g.firstName)} ${S(g.lastName)}`.trim(), phone || null, S(g.email) || null].filter(Boolean).join(' · ')
}
const relationLabel = (r: ApplicantScoutRelation) => {
  const who = r.relatedMemberName || `${S(r.firstName)} ${S(r.lastName)}`.trim() || 'Proche'
  const rel = r.relationship ? `${r.relationship} — ` : ''
  if (r.status === 'CurrentInGroup') return `${rel}${who} (membre actuel${r.relatedMemberUnit ? `, ${r.relatedMemberUnit}` : ''})`
  if (r.status === 'AncienInGroup') return `${rel}${who} (ancien${r.lastUnit ? `, ${r.lastUnit}` : ''})`
  return `${rel}${who}${r.otherGroupName ? ` (${r.otherGroupName})` : ' (autre groupe)'}`
}

// The comparable child + household fields. `sig` = equality key (identical → auto-merged), `display` = shown
// value, `values` = the exact DemandeMergeFields slice this field contributes to the merged keeper.
type FieldDesc = { key: string; label: string; sig: (d: DemandeReview) => string; display: (d: DemandeReview) => string; values: (d: DemandeReview) => Partial<DemandeMergeFields> }
const FIELDS: FieldDesc[] = [
  { key: 'firstName', label: 'Prénom', sig: d => S(d.firstName), display: d => dash(d.firstName), values: d => ({ firstName: d.firstName }) },
  { key: 'lastName', label: 'Nom', sig: d => S(d.lastName), display: d => dash(d.lastName), values: d => ({ lastName: d.lastName }) },
  { key: 'dateOfBirth', label: 'Date de naissance', sig: d => S(d.dateOfBirth), display: d => fmtDate(d.dateOfBirth), values: d => ({ dateOfBirth: d.dateOfBirth }) },
  { key: 'gender', label: 'Sexe', sig: d => S(d.gender), display: d => dash(d.gender), values: d => ({ gender: d.gender }) },
  { key: 'nationality', label: 'Nationalité', sig: d => S(d.nationality), display: d => dash(d.nationality), values: d => ({ nationality: d.nationality }) },
  { key: 'school', label: 'École', sig: d => S(d.school), display: d => dash(d.school), values: d => ({ school: d.school }) },
  { key: 'classe', label: 'Classe', sig: d => S(d.classe), display: d => dash(d.classe), values: d => ({ classe: d.classe }) },
  { key: 'section', label: 'Section', sig: d => S(d.section), display: d => dash(d.section), values: d => ({ section: d.section }) },
  { key: 'bloodType', label: 'Groupe sanguin', sig: d => S(d.bloodType), display: d => dash(d.bloodType), values: d => ({ bloodType: d.bloodType }) },
  { key: 'phone', label: 'Téléphone', sig: d => digits(d.phoneNumber), display: d => formatPhoneDisplay(d.phoneCountryCode, d.phoneNumber) || '—', values: d => ({ phoneNumber: d.phoneNumber, phoneCountryCode: d.phoneCountryCode ?? null }) },
  { key: 'email', label: 'Email de l’enfant', sig: d => norm(d.email), display: d => dash(d.email), values: d => ({ email: d.email }) },
  { key: 'medicalNotes', label: 'Notes médicales', sig: d => S(d.medicalNotes), display: d => dash(d.medicalNotes), values: d => ({ medicalNotes: d.medicalNotes }) },
  { key: 'allergies', label: 'Allergies', sig: d => S(d.allergies), display: d => dash(d.allergies), values: d => ({ allergies: d.allergies }) },
  { key: 'parentNotes', label: 'Note des parents', sig: d => S(d.parentNotes), display: d => dash(d.parentNotes), values: d => ({ parentNotes: d.parentNotes }) },
  { key: 'previousDemande', label: 'Demande précédente', sig: d => `${d.hasPreviousDemande ? '1' : '0'}|${S(d.previousDemandeYear)}`, display: d => (d.hasPreviousDemande ? `Oui${d.previousDemandeYear ? ` (${d.previousDemandeYear})` : ''}` : 'Non'), values: d => ({ hasPreviousDemande: !!d.hasPreviousDemande, previousDemandeYear: d.previousDemandeYear ?? null }) },
  { key: 'address', label: 'Adresse', sig: d => `${norm(d.addressCity)}|${norm(d.addressDetails)}|${norm(d.addressCountry)}`, display: d => [S(d.addressDetails), S(d.addressCity), S(d.addressCountry)].filter(Boolean).join(', ') || '—', values: d => ({ addressCity: d.addressCity, addressDetails: d.addressDetails, addressCountry: d.addressCountry }) },
  { key: 'parentsSituation', label: 'Situation des parents', sig: d => S(d.parentsSituation), display: d => dash(d.parentsSituation), values: d => ({ parentsSituation: d.parentsSituation }) },
]

// unique demandes by a field signature (one representative per distinct value)
function distinctByField(demandes: DemandeReview[], desc: FieldDesc) {
  const seen = new Set<string>()
  const out: DemandeReview[] = []
  for (const d of demandes) { const k = desc.sig(d); if (!seen.has(k)) { seen.add(k); out.push(d) } }
  return out
}

export default function DemandeDuplicatesPage() {
  const { data: campaign } = useCampaignStatus()
  const scoutYear = campaign?.scoutYear ?? ''
  const { data: groups, isLoading } = useDuplicateDemandes(scoutYear)
  const [merging, setMerging] = useState<DuplicateDemandeGroup | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Doublons de demandes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fusionnez les demandes présentées plusieurs fois pour le même enfant. Les champs identiques sont fusionnés
          automatiquement ; vous décidez de ceux qui diffèrent (y compris les parents et les proches).
        </p>
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !groups || groups.length === 0 ? (
        <EmptyState icon={Users} title="Aucun doublon détecté"
          description={scoutYear ? `Aucune demande présentée en double pour ${scoutYear}.` : 'Aucun doublon.'} />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{groups.length} enfant(s) avec des demandes en double.</p>
          {groups.map((g, i) => (
            <Card key={i}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{g.demandes[0].firstName} {g.demandes[0].lastName}</span>
                    <Badge variant="outline">{g.demandes.length} demandes</Badge>
                    <Badge variant="secondary">{g.evidence}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {g.demandes.map(d => `${d.serialNumber ?? '—'} · ${d.accountEmail}`).join('   |   ')}
                  </div>
                </div>
                <Button onClick={() => setMerging(g)}><GitMerge className="mr-2 h-4 w-4" />Fusionner</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {merging && <MergeDialog group={merging} onClose={() => setMerging(null)} />}
    </div>
  )
}

function MergeDialog({ group, onClose }: { group: DuplicateDemandeGroup; onClose: () => void }) {
  const merge = useMergeDemandes()
  const demandes = group.demandes
  const byId = useMemo(() => Object.fromEntries(demandes.map(d => [d.id, d])), [demandes])

  const [keeperId, setKeeperId] = useState(demandes[0].id)
  const keeper = byId[keeperId] as DemandeReview
  const keeperAccountId = keeper.accountId

  // Per-field chosen value = a signature; identical fields (1 distinct sig) aren't shown. Default = keeper's value.
  const initChosen = (k: DemandeReview) => Object.fromEntries(FIELDS.map(f => [f.key, f.sig(k)]))
  const [chosen, setChosen] = useState<Record<string, string>>(() => initChosen(keeper))
  // Parents / proches are ticked; we track the UNticked signatures (default: everything kept = nothing unticked).
  const [uncheckedG, setUncheckedG] = useState<Set<string>>(new Set())
  const [uncheckedR, setUncheckedR] = useState<Set<string>>(new Set())
  const [sendEmail, setSendEmail] = useState(false)

  // Reset all selections when the keeper changes (render-phase reset — the codebase's pattern).
  const [prevKeeper, setPrevKeeper] = useState(keeperId)
  if (keeperId !== prevKeeper) {
    setPrevKeeper(keeperId)
    setChosen(initChosen(byId[keeperId] as DemandeReview))
    setUncheckedG(new Set()); setUncheckedR(new Set())
  }

  // Distinct parents across the group. Representative id prefers a copy already on the KEEPER's account (so it
  // stays put — a loser-only parent is copied over). onKeeper = at least one occurrence is the keeper's own.
  const distinctGuardians = useMemo(() => {
    const map = new Map<string, { sig: string; id: string; label: string; onKeeper: boolean; count: number }>()
    for (const d of demandes) {
      for (const g of d.guardians) {
        if (!g.id) continue
        const sig = guardianSig(g)
        const mine = d.accountId === keeperAccountId
        const cur = map.get(sig)
        if (!cur) map.set(sig, { sig, id: g.id, label: guardianLabel(g), onKeeper: mine, count: 1 })
        else { cur.count++; if (mine && !cur.onKeeper) { cur.onKeeper = true; cur.id = g.id } }
      }
    }
    return [...map.values()]
  }, [demandes, keeperAccountId])

  const distinctRelations = useMemo(() => {
    const map = new Map<string, { sig: string; id: string; label: string; onKeeper: boolean; count: number }>()
    for (const d of demandes) {
      for (const r of d.scoutRelations) {
        if (!r.id) continue
        const sig = relationSig(r)
        const mine = d.accountId === keeperAccountId
        const cur = map.get(sig)
        if (!cur) map.set(sig, { sig, id: r.id, label: relationLabel(r), onKeeper: mine, count: 1 })
        else { cur.count++; if (mine && !cur.onKeeper) { cur.onKeeper = true; cur.id = r.id } }
      }
    }
    return [...map.values()]
  }, [demandes, keeperAccountId])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, sig: string) => {
    const next = new Set(set); if (next.has(sig)) next.delete(sig); else next.add(sig); setter(next)
  }

  const loserIds = demandes.filter(d => d.id !== keeperId).map(d => d.id)
  // A loser account is fully removed only if none of its demandes survive (i.e. it isn't the keeper's account).
  const deletedAccounts = useMemo(() => {
    const keep = keeperAccountId
    return [...new Set(demandes.filter(d => d.id !== keeperId && d.accountId !== keep).map(d => d.accountEmail))]
  }, [demandes, keeperId, keeperAccountId])

  const handleMerge = async () => {
    // Compose the chosen field values (identical fields resolve to the keeper's value).
    const fields = {} as DemandeMergeFields
    for (const f of FIELDS) {
      const sig = chosen[f.key] ?? f.sig(keeper)
      const src = demandes.find(d => f.sig(d) === sig) ?? keeper
      Object.assign(fields, f.values(src))
    }
    const keepGuardianIds = distinctGuardians.filter(g => !uncheckedG.has(g.sig)).map(g => g.id)
    const keepScoutRelationIds = distinctRelations.filter(r => !uncheckedR.has(r.sig)).map(r => r.id)
    try {
      const res = await merge.mutateAsync({ keeperId, loserIds, fields, keepGuardianIds, keepScoutRelationIds, sendEmail })
      const parts = [`${res.losersMerged} doublon(s) fusionné(s)`]
      if (res.accountsDeleted > 0) parts.push(`${res.accountsDeleted} compte(s) supprimé(s)`)
      if (res.emailsQueued > 0) parts.push(`${res.emailsQueued} email(s) envoyé(s)`)
      toast.success(parts.join(' · '))
      onClose()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fusionner — {keeper.firstName} {keeper.lastName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {/* Keeper selector */}
          <section>
            <h3 className="mb-2 font-semibold">Demande à conserver</h3>
            <div className="space-y-1.5">
              {demandes.map(d => (
                <label key={d.id} className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 ${d.id === keeperId ? 'border-primary bg-primary/5' : ''}`}>
                  <input type="radio" name="keeper" checked={d.id === keeperId} onChange={() => setKeeperId(d.id)} />
                  <span className="font-medium">{d.serialNumber ?? '—'}</span>
                  <span className="text-muted-foreground">· {d.accountEmail}</span>
                  <span className="text-muted-foreground">· {d.submittedAt ? new Date(d.submittedAt).toLocaleDateString('fr-FR') : 'non soumise'}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{d.status}</Badge>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Les autres demandes seront supprimées{deletedAccounts.length > 0 ? `, ainsi que ${deletedAccounts.length} compte(s) sans autre demande` : ''}.</p>
          </section>

          {/* Child + household fields */}
          <section>
            <h3 className="mb-2 font-semibold">Informations</h3>
            <div className="space-y-2">
              {FIELDS.map(f => {
                const opts = distinctByField(demandes, f)
                const identical = opts.length === 1
                const cur = chosen[f.key] ?? f.sig(keeper)
                return (
                  <div key={f.key} className="grid grid-cols-[9rem,1fr] items-start gap-2 border-b py-1.5 last:border-0">
                    <div className="pt-0.5 text-xs font-medium text-muted-foreground">{f.label}</div>
                    {identical ? (
                      <div className="flex items-start gap-1.5 text-sm">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
                        <span className="whitespace-pre-wrap break-words">{f.display(opts[0])}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {opts.map(o => {
                          const sig = f.sig(o)
                          return (
                            <label key={sig} className={`flex cursor-pointer items-start gap-2 rounded-md border p-1.5 ${cur === sig ? 'border-primary bg-primary/5' : ''}`}>
                              <input type="radio" name={`f-${f.key}`} className="mt-1" checked={cur === sig} onChange={() => setChosen(c => ({ ...c, [f.key]: sig }))} />
                              <span className="whitespace-pre-wrap break-words">{f.display(o) || '—'}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Parents (guardians) — item by item */}
          <section>
            <h3 className="mb-2 font-semibold">Parents ({distinctGuardians.filter(g => !uncheckedG.has(g.sig)).length}/{distinctGuardians.length})</h3>
            {distinctGuardians.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun parent renseigné.</p>
            ) : (
              <div className="space-y-1.5">
                {distinctGuardians.map(g => (
                  <label key={g.sig} className="flex cursor-pointer items-start gap-2 rounded-md border p-2">
                    <input type="checkbox" className="mt-1" checked={!uncheckedG.has(g.sig)} onChange={() => toggle(uncheckedG, setUncheckedG, g.sig)} />
                    <span className="min-w-0 flex-1 break-words">{g.label}</span>
                    {g.count > 1 && <Badge variant="secondary" className="text-[10px]">sur {g.count}</Badge>}
                    {!g.onKeeper && <Badge variant="outline" className="text-[10px]">à ajouter</Badge>}
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* Proches (scout relations) — item by item */}
          <section>
            <h3 className="mb-2 font-semibold">Proches scouts ({distinctRelations.filter(r => !uncheckedR.has(r.sig)).length}/{distinctRelations.length})</h3>
            {distinctRelations.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun proche renseigné.</p>
            ) : (
              <div className="space-y-1.5">
                {distinctRelations.map(r => (
                  <label key={r.sig} className="flex cursor-pointer items-start gap-2 rounded-md border p-2">
                    <input type="checkbox" className="mt-1" checked={!uncheckedR.has(r.sig)} onChange={() => toggle(uncheckedR, setUncheckedR, r.sig)} />
                    <span className="min-w-0 flex-1 break-words">{r.label}</span>
                    {r.count > 1 && <Badge variant="secondary" className="text-[10px]">sur {r.count}</Badge>}
                    {!r.onKeeper && <Badge variant="outline" className="text-[10px]">à ajouter</Badge>}
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* Notify */}
          <label className="flex items-center gap-2 rounded-md border bg-muted/20 p-2">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
            <span>Envoyer un email aux comptes pour les informer du regroupement (demande conservée / supprimées).</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={merge.isPending}>Annuler</Button>
          <Button onClick={handleMerge} disabled={merge.isPending}>
            <GitMerge className="mr-2 h-4 w-4" />{merge.isPending ? 'Fusion…' : 'Fusionner les demandes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
