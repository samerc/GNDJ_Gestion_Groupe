import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  useApplicantConfig, useApplicantProfile, useCreateDemande, useUpdateDemande,
  useSubmitDemande, useSaveHousehold,
  type ApplicantGuardian, type ApplicantScoutRelation, type DemandeInput,
} from '@/services/applicant-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { DateInput } from '@/components/shared/date-input'
import { NATIONALITY_OPTIONS, PROFESSION_OPTIONS } from '@/lib/options'
import { matchSchool } from '@/services/settings-service'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, Send, UserRound, Users, Link2 } from 'lucide-react'

const STEPS = ['Enfant', 'Parents', 'Proches scouts', 'Récapitulatif']
const GENDERS = ['Masculin', 'Féminin']
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const G_REL = ['Père', 'Mère', 'Tuteur', 'Tutrice', 'Autre']
const R_REL = ['Frère', 'Sœur', 'Cousin', 'Cousine', 'Oncle', 'Tante', 'Autre']
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Errors = Record<string, string>

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function emptyChild(): DemandeInput {
  return {
    firstName: '', lastName: '', dateOfBirth: null, gender: null, nationality: null, school: null, classe: null,
    section: null, bloodType: null, medicalNotes: null, allergies: null, phoneCountryCode: null, phoneNumber: null,
    email: null, parentNotes: null,
  }
}
function blankGuardian(rel: string): ApplicantGuardian {
  return { relationship: rel, firstName: '', lastName: '', profession: null, phoneCountryCode: '+961', phoneNumber: null, email: null, isDeceased: false, isPrimaryContact: rel === 'Père', isEmergencyContact: false }
}

export default function DemandeWizardPage() {
  const { id = 'new' } = useParams()
  const navigate = useNavigate()
  const { data: config } = useApplicantConfig()
  const { data: profile, isLoading } = useApplicantProfile()
  const createMutation = useCreateDemande()
  const updateMutation = useUpdateDemande()
  const submitMutation = useSubmitDemande()
  const householdMutation = useSaveHousehold()

  const [demandeId, setDemandeId] = useState(id)
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const [child, setChild] = useState<DemandeInput>(emptyChild())
  const [schoolOther, setSchoolOther] = useState(false)
  const [guardians, setGuardians] = useState<ApplicantGuardian[]>([blankGuardian('Père'), blankGuardian('Mère')])
  const [relations, setRelations] = useState<ApplicantScoutRelation[]>([])
  const [address, setAddress] = useState({ country: 'Liban', city: '', details: '' })

  const existing = useMemo(() => profile?.demandes.find((d) => d.id === id), [profile, id])
  const readonly = !!existing && (!!existing.responseSentAt || !(config?.isOpen ?? false))
  const notesMax = config?.notesMaxLength ?? 500
  const maxRelations = config?.maxScoutRelations ?? 50

  // Hydrate from profile (shared data always; child only when editing existing)
  useEffect(() => {
    if (!profile) return
    if (profile.guardians.length) setGuardians(profile.guardians)
    if (profile.scoutRelations.length) setRelations(profile.scoutRelations)
    setAddress({ country: profile.addressCountry ?? 'Liban', city: profile.addressCity ?? '', details: profile.addressDetails ?? '' })
    if (existing) {
      const { id: _id, scoutYear, status, decisionNotes, submittedAt, responseSentAt, ...rest } = existing
      void _id; void scoutYear; void status; void decisionNotes; void submittedAt; void responseSentAt
      setChild(rest)
      if (rest.school && config && !config.schools.includes(rest.school)) setSchoolOther(true)
    }
  }, [profile, existing, config])

  if (isLoading) return <LoadingSpinner variant="page" />

  const setC = (patch: Partial<DemandeInput>) => setChild((c) => ({ ...c, ...patch }))

  // ── validation ──
  function validateStep(s: number): Errors {
    const e: Errors = {}
    if (s === 0) {
      if (!child.firstName?.trim()) e.firstName = 'Requis'
      if (!child.lastName?.trim()) e.lastName = 'Requis'
      if (!child.dateOfBirth) e.dateOfBirth = 'Requis'
      else if (new Date(child.dateOfBirth) > new Date()) e.dateOfBirth = 'Date invalide'
      if (!child.gender) e.gender = 'Requis'
      if (!child.nationality?.trim()) e.nationality = 'Requis'
      if (!child.school?.trim()) e.school = 'Requis'
      if (!child.classe?.trim()) e.classe = 'Requis'
      if (child.email && !emailRe.test(child.email)) e.email = 'Email invalide'
    }
    if (s === 1) {
      const filled = guardians.filter((g) => g.firstName.trim() || g.lastName.trim())
      if (filled.length === 0) e.guardians = 'Renseignez au moins un parent / tuteur.'
      filled.forEach((g, i) => {
        if (!g.firstName.trim()) e[`g_${i}_first`] = 'Requis'
        if (!g.lastName.trim()) e[`g_${i}_last`] = 'Requis'
        if (g.email && !emailRe.test(g.email)) e[`g_${i}_email`] = 'Email invalide'
      })
    }
    return e
  }

  async function persist(): Promise<string | null> {
    // shared household
    await householdMutation.mutateAsync({
      contactName: profile?.contactName ?? null,
      addressCountry: address.country, addressCity: address.city, addressDetails: address.details,
      guardians: guardians.filter((g) => g.firstName.trim() || g.lastName.trim()),
      scoutRelations: relations.filter((r) => r.firstName?.trim() || r.lastName?.trim() || r.relatedMemberId),
    })
    // demande
    if (demandeId === 'new') {
      const res = await createMutation.mutateAsync(child)
      setDemandeId(res.id)
      window.history.replaceState(null, '', `/inscription/portail/demande/${res.id}`)
      return res.id
    } else {
      await updateMutation.mutateAsync({ id: demandeId, data: child })
      return demandeId
    }
  }

  async function go(target: number) {
    if (readonly) { setStep(target); return }
    // validate when moving forward past a gated step
    if (target > step) {
      const e = validateStep(step)
      if (Object.keys(e).length) { setErrors(e); toast.error('Veuillez corriger les champs indiqués.'); return }
    }
    setErrors({})
    setSaving(true)
    try { await persist() } catch (err) { toast.error(parseApiError(err)); setSaving(false); return }
    setSaving(false)
    setStep(target)
  }

  async function handleSubmit() {
    const e0 = validateStep(0), e1 = validateStep(1)
    const all = { ...e0, ...e1 }
    if (Object.keys(all).length) { setErrors(all); setStep(Object.keys(e0).length ? 0 : 1); toast.error('Informations incomplètes.'); return }
    setSaving(true)
    try {
      const did = await persist()
      if (did) { await submitMutation.mutateAsync(did); toast.success('Demande soumise avec succès !'); navigate('/inscription/portail') }
    } catch (err) { toast.error(parseApiError(err)) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {readonly ? 'Demande' : demandeId === 'new' ? 'Nouvelle demande' : 'Modifier la demande'}
          {child.firstName && ` — ${child.firstName} ${child.lastName}`}
        </h1>
        <Button variant="ghost" size="sm" onClick={() => navigate('/inscription/portail')}>Retour</Button>
      </div>

      {readonly && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          {existing?.responseSentAt ? 'Cette demande a été traitée — consultation uniquement.' : 'Les inscriptions sont fermées — consultation uniquement.'}
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => go(i)}
            className={cn('flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              i === step ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-xs',
              i === step ? 'bg-white/20' : 'bg-muted')}>{i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          {/* STEP 0 — child */}
          {step === 0 && (
            <fieldset disabled={readonly} className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><UserRound className="h-4 w-4" />Informations de l'enfant</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prénom" required error={errors.firstName}>
                  <Input value={child.firstName} onChange={(e) => setC({ firstName: e.target.value })} className={errors.firstName ? 'border-destructive' : ''} />
                </Field>
                <Field label="Nom" required error={errors.lastName}>
                  <Input value={child.lastName} onChange={(e) => setC({ lastName: e.target.value.toUpperCase() })} className={errors.lastName ? 'border-destructive' : ''} />
                </Field>
                <Field label="Date de naissance" required error={errors.dateOfBirth}>
                  <DateInput value={child.dateOfBirth} onChange={(v) => setC({ dateOfBirth: v })} className={errors.dateOfBirth ? 'border-destructive' : ''} />
                </Field>
                <Field label="Genre" required error={errors.gender}>
                  <Select value={child.gender ?? ''} onValueChange={(v) => setC({ gender: v })}>
                    <SelectTrigger className={errors.gender ? 'border-destructive' : ''}><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Nationalité" required error={errors.nationality}>
                  <SearchableSelect value={child.nationality ?? ''} onValueChange={(v) => setC({ nationality: v })} options={NATIONALITY_OPTIONS} pinnedValues={['Libanaise']} searchPlaceholder="Rechercher une nationalité..." />
                </Field>
                <Field label="École" required error={errors.school}>
                  <Select value={schoolOther ? '__other' : (child.school ?? '')} onValueChange={(v) => { if (v === '__other') { setSchoolOther(true); setC({ school: '' }) } else { setSchoolOther(false); setC({ school: v }) } }}>
                    <SelectTrigger className={errors.school ? 'border-destructive' : ''}><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      {(config?.schools ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      <SelectItem value="__other">Autre…</SelectItem>
                    </SelectContent>
                  </Select>
                  {schoolOther && <Input className="mt-2" placeholder="Nom de l'école" value={child.school ?? ''} onChange={(e) => setC({ school: e.target.value })}
                    onBlur={(e) => { const matched = matchSchool(e.target.value, config?.schools ?? []); setC({ school: matched }); if ((config?.schools ?? []).includes(matched)) setSchoolOther(false) }} />}
                </Field>
                <Field label="Classe" required error={errors.classe}>
                  {(config?.classes?.length ?? 0) > 0 ? (
                    <Select value={child.classe ?? ''} onValueChange={(v) => setC({ classe: v })}>
                      <SelectTrigger className={errors.classe ? 'border-destructive' : ''}><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                      <SelectContent>{(config?.classes ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input value={child.classe ?? ''} onChange={(e) => setC({ classe: e.target.value })} className={errors.classe ? 'border-destructive' : ''} />
                  )}
                </Field>
                <Field label="Section"><Input value={child.section ?? ''} onChange={(e) => setC({ section: e.target.value })} maxLength={5} /></Field>
                <Field label="Groupe sanguin">
                  <Select value={child.bloodType ?? ''} onValueChange={(v) => setC({ bloodType: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{BLOOD.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Email de l'enfant (optionnel)" error={errors.email}>
                  <Input type="email" value={child.email ?? ''} onChange={(e) => setC({ email: e.target.value || null })} className={errors.email ? 'border-destructive' : ''} />
                </Field>
                <Field label="Téléphone de l'enfant (optionnel)">
                  <Input value={child.phoneNumber ?? ''} onChange={(e) => setC({ phoneNumber: e.target.value || null })} />
                </Field>
              </div>
              <Field label="Allergies"><Input value={child.allergies ?? ''} onChange={(e) => setC({ allergies: e.target.value || null })} /></Field>
              <Field label="Notes médicales"><Input value={child.medicalNotes ?? ''} onChange={(e) => setC({ medicalNotes: e.target.value || null })} /></Field>
              <Field label={`Notes / demandes particulières (${(child.parentNotes ?? '').length}/${notesMax})`}>
                <textarea value={child.parentNotes ?? ''} maxLength={notesMax} onChange={(e) => setC({ parentNotes: e.target.value || null })}
                  className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-2xs focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="Ex. : préférence d'unité, informations utiles…" />
              </Field>
            </fieldset>
          )}

          {/* STEP 1 — parents */}
          {step === 1 && (
            <fieldset disabled={readonly} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Users className="h-4 w-4" />Parents / tuteurs <span className="font-normal">(communs à tous vos enfants)</span></div>
              </div>
              {errors.guardians && <p className="text-sm text-destructive">{errors.guardians}</p>}
              {guardians.map((g, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Select value={g.relationship} onValueChange={(v) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, relationship: v } : x))}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{G_REL.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                    {guardians.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setGuardians((arr) => arr.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Prénom" required error={errors[`g_${i}_first`]}>
                      <Input value={g.firstName} onChange={(e) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, firstName: e.target.value } : x))} className={errors[`g_${i}_first`] ? 'border-destructive' : ''} />
                    </Field>
                    <Field label="Nom" required error={errors[`g_${i}_last`]}>
                      <Input value={g.lastName} onChange={(e) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, lastName: e.target.value.toUpperCase() } : x))} className={errors[`g_${i}_last`] ? 'border-destructive' : ''} />
                    </Field>
                    <Field label="Profession">
                      <SearchableSelect value={g.profession ?? ''} onValueChange={(v) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, profession: v } : x))} options={PROFESSION_OPTIONS} searchPlaceholder="Rechercher une profession..." />
                    </Field>
                    <Field label="Téléphone"><Input value={g.phoneNumber ?? ''} onChange={(e) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, phoneNumber: e.target.value } : x))} /></Field>
                    <Field label="Email" error={errors[`g_${i}_email`]}>
                      <Input type="email" value={g.email ?? ''} onChange={(e) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} className={errors[`g_${i}_email`] ? 'border-destructive' : ''} />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={g.isPrimaryContact} onChange={(e) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, isPrimaryContact: e.target.checked } : x))} />Contact principal</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={g.isEmergencyContact} onChange={(e) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, isEmergencyContact: e.target.checked } : x))} />Contact d'urgence</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={g.isDeceased} onChange={(e) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, isDeceased: e.target.checked } : x))} />Décédé(e)</label>
                  </div>
                </div>
              ))}
              {!readonly && <Button variant="outline" size="sm" onClick={() => setGuardians((arr) => [...arr, blankGuardian('Tuteur')])}><Plus className="mr-1 h-4 w-4" />Ajouter un parent / tuteur</Button>}

              <div className="pt-2">
                <div className="text-sm font-semibold text-muted-foreground mb-2">Adresse du domicile</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Pays"><Input value={address.country} onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))} /></Field>
                  <Field label="Ville"><Input value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} /></Field>
                  <Field label="Adresse"><Input value={address.details} onChange={(e) => setAddress((a) => ({ ...a, details: e.target.value }))} /></Field>
                </div>
              </div>
            </fieldset>
          )}

          {/* STEP 2 — scout relations */}
          {step === 2 && (
            <fieldset disabled={readonly} className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Link2 className="h-4 w-4" />Proches déjà scouts <span className="font-normal">(optionnel, communs à tous vos enfants)</span></div>
              <p className="text-sm text-muted-foreground">Frères, sœurs ou proches qui sont ou ont été scouts. Cela nous aide à regrouper les familles.</p>
              <p className="text-xs text-muted-foreground">{relations.length} / {maxRelations} proches ajoutés (maximum {maxRelations}).</p>
              {relations.map((r, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Select value={r.status} onValueChange={(v) => setRelations((arr) => arr.map((x, j) => j === i ? { ...x, status: v } : x))}>
                      <SelectTrigger className="h-11 w-72 text-base sm:w-96"><SelectValue placeholder="Situation" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CurrentInGroup">Scout actuel dans notre groupe</SelectItem>
                        <SelectItem value="AncienInGroup">Ancien de notre groupe</SelectItem>
                        <SelectItem value="OtherGroup">Scout dans un autre groupe</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRelations((arr) => arr.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Prénom"><Input value={r.firstName ?? ''} onChange={(e) => setRelations((arr) => arr.map((x, j) => j === i ? { ...x, firstName: e.target.value } : x))} /></Field>
                    <Field label="Nom"><Input value={r.lastName ?? ''} onChange={(e) => setRelations((arr) => arr.map((x, j) => j === i ? { ...x, lastName: e.target.value.toUpperCase() } : x))} /></Field>
                    <Field label="Lien de parenté">
                      <Select value={r.relationship ?? ''} onValueChange={(v) => setRelations((arr) => arr.map((x, j) => j === i ? { ...x, relationship: v } : x))}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{R_REL.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    {r.status === 'CurrentInGroup' && (config?.units?.length ?? 0) > 0 && (
                      <Field label="Unité actuelle">
                        <Select value={r.lastUnit ?? ''} onValueChange={(v) => setRelations((arr) => arr.map((x, j) => j === i ? { ...x, lastUnit: v } : x))}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner l'unité" /></SelectTrigger>
                          <SelectContent>{(config?.units ?? []).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                    )}
                    {r.status === 'OtherGroup' && (
                      <Field label="Nom du groupe"><Input value={r.otherGroupName ?? ''} onChange={(e) => setRelations((arr) => arr.map((x, j) => j === i ? { ...x, otherGroupName: e.target.value } : x))} /></Field>
                    )}
                    {r.status === 'AncienInGroup' && (
                      <>
                        <Field label="Dernière unité"><Input value={r.lastUnit ?? ''} onChange={(e) => setRelations((arr) => arr.map((x, j) => j === i ? { ...x, lastUnit: e.target.value } : x))} /></Field>
                        <Field label="Dernière fonction"><Input value={r.lastFunction ?? ''} onChange={(e) => setRelations((arr) => arr.map((x, j) => j === i ? { ...x, lastFunction: e.target.value } : x))} /></Field>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {!readonly && (
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" disabled={relations.length >= maxRelations} onClick={() => setRelations((arr) => [...arr, { status: 'CurrentInGroup', relationship: null, firstName: '', lastName: '', relatedMemberId: null }])}><Plus className="mr-1 h-4 w-4" />Ajouter un proche</Button>
                  {relations.length >= maxRelations && <span className="text-xs text-muted-foreground">Maximum de {maxRelations} proches atteint.</span>}
                </div>
              )}
            </fieldset>
          )}

          {/* STEP 3 — review */}
          {step === 3 && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">Enfant</div>
                <p>{child.firstName} {child.lastName} · {child.dateOfBirth ? new Date(child.dateOfBirth).toLocaleDateString('fr-FR') : '—'} · {child.gender}</p>
                <p className="text-muted-foreground">{child.school} · {child.classe} · {child.nationality}</p>
                {child.parentNotes && <p className="mt-2 rounded bg-muted/40 p-2 text-muted-foreground">{child.parentNotes}</p>}
              </div>
              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">Parents / tuteurs</div>
                {guardians.filter((g) => g.firstName || g.lastName).map((g, i) => (
                  <p key={i}>{g.relationship} : {g.firstName} {g.lastName}{g.phoneNumber ? ` · ${g.phoneNumber}` : ''}{g.email ? ` · ${g.email}` : ''}</p>
                ))}
                <p className="text-muted-foreground mt-1">{[address.details, address.city, address.country].filter(Boolean).join(', ')}</p>
              </div>
              {relations.filter((r) => r.firstName || r.lastName).length > 0 && (
                <div className="rounded-lg border p-4">
                  <div className="font-semibold mb-2">Proches scouts</div>
                  {relations.filter((r) => r.firstName || r.lastName).map((r, i) => (
                    <p key={i}>{r.firstName} {r.lastName}{r.relationship ? ` (${r.relationship})` : ''} — {r.status === 'CurrentInGroup' ? `Membre GNDJ${r.lastUnit ? ` · ${r.lastUnit}` : ''}` : r.status === 'AncienInGroup' ? 'ancien' : r.otherGroupName || 'autre groupe'}</p>
                  ))}
                </div>
              )}
              {!readonly && existing?.status !== 'Submitted' && (
                <p className="text-muted-foreground">En soumettant, votre demande sera transmise au chef de groupe pour étude.</p>
              )}
              {existing?.status === 'Submitted' && !existing.responseSentAt && (
                <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-blue-700">Demande déjà soumise. Vous pouvez encore la modifier tant que les inscriptions sont ouvertes.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Nav */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => go(step - 1)} disabled={step === 0 || saving}><ChevronLeft className="mr-1 h-4 w-4" />Précédent</Button>
        {step < 3 ? (
          <Button onClick={() => go(step + 1)} disabled={saving}>{saving ? 'Enregistrement…' : 'Suivant'}<ChevronRight className="ml-1 h-4 w-4" /></Button>
        ) : !readonly ? (
          <Button onClick={handleSubmit} disabled={saving || submitMutation.isPending}><Send className="mr-1 h-4 w-4" />{existing?.status === 'Submitted' ? 'Mettre à jour' : 'Soumettre la demande'}</Button>
        ) : (
          <Button onClick={() => navigate('/inscription/portail')}><Check className="mr-1 h-4 w-4" />Fermer</Button>
        )}
      </div>
    </div>
  )
}
