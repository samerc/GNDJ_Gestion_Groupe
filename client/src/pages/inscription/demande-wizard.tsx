import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  useApplicantConfig, useApplicantProfile, useCreateDemande, useUpdateDemande,
  useSubmitDemande, useSaveHousehold, useRequestHouseholdLookup, useVerifyHouseholdLookup,
  type ApplicantGuardian, type ApplicantScoutRelation, type DemandeInput,
} from '@/services/applicant-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { CitySelect } from '@/components/shared/city-select'
import { DateInput } from '@/components/shared/date-input'
import { NATIONALITY_OPTIONS } from '@/lib/options'
import { matchSchool } from '@/services/settings-service'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, Send, UserRound, Users, Link2, Pencil } from 'lucide-react'

// 4-step demande (enrollment request) wizard — the core of the applicant portal.
// Steps: 0 Enfant (per-child) → 1 Parents + adresse → 2 Proches scouts → 3 Récapitulatif/submit.
// KEY MODEL: steps 1 & 2 + the address are the SHARED HOUSEHOLD (common to every child of the
// account, persisted via saveHousehold); only step 0 is per-demande (this child). Free step nav
// via the stepper; validation runs on-spot (inline) and on forward nav / submit. `id="new"` =
// create flow, otherwise edit an existing demande.
const STEPS = ['Enfant', 'Parents', 'Proches scouts', 'Récapitulatif']
const GENDERS = ['Masculin', 'Féminin']
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const G_REL = ['Père', 'Mère', 'Tuteur', 'Tutrice', 'Autre']
const R_REL = ['Père / Mère', 'Frère / Sœur', 'Cousin / Cousine', 'Oncle / Tante']
// Situation of a "proche scout" (codes are structural — drive conditional fields + auto-link). Labels shown to
// the parent (dropdown + the summary list). Order = display order in the Select.
const R_STATUS: { value: string; label: string }[] = [
  { value: 'CurrentInGroup', label: 'Membre actuel du Groupe Notre-Dame Jamhour' },
  { value: 'AncienInGroup', label: 'Ancien Membre du Groupe Notre-Dame Jamhour' },
  { value: 'OtherGroup', label: 'Scout dans un autre groupe' },
]
const rStatusLabel = (s: string) => R_STATUS.find((x) => x.value === s)?.label ?? s
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Errors = Record<string, string> // field-key → message; guardian errors are keyed `g_<index>_<field>`

// Labelled form-field wrapper: label (+ red * when required) above the control, error text below.
function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// Edit form for ONE "proche scout" (master-detail step 2). Situation + names + relationship, plus the
// status-specific field (current member → unit dropdown; other group → group name; ancien → last unit/function).
function RelationEditForm({ r, units, onChange, onDone }: {
  r: ApplicantScoutRelation
  units: string[]
  onChange: (patch: Partial<ApplicantScoutRelation>) => void
  onDone: () => void
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <Field label="Situation">
        <Select value={r.status} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger className="h-11 text-base"><SelectValue placeholder="Situation" /></SelectTrigger>
          <SelectContent>{R_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prénom"><Input value={r.firstName ?? ''} onChange={(e) => onChange({ firstName: e.target.value })} /></Field>
        <Field label="Nom"><Input value={r.lastName ?? ''} onChange={(e) => onChange({ lastName: e.target.value.toUpperCase() })} /></Field>
        <Field label="Lien de parenté">
          <Select value={r.relationship ?? ''} onValueChange={(v) => onChange({ relationship: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{R_REL.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {r.status === 'CurrentInGroup' && units.length > 0 && (
          <Field label="Unité actuelle">
            <Select value={r.lastUnit ?? ''} onValueChange={(v) => onChange({ lastUnit: v })}>
              <SelectTrigger><SelectValue placeholder="Sélectionner l'unité" /></SelectTrigger>
              <SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}
        {r.status === 'OtherGroup' && (
          <Field label="Nom du groupe"><Input value={r.otherGroupName ?? ''} onChange={(e) => onChange({ otherGroupName: e.target.value })} /></Field>
        )}
        {r.status === 'OtherGroup' && (
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!r.otherGroupIsFormer} onChange={(e) => onChange({ otherGroupIsFormer: e.target.checked })} />
              Ancien de ce groupe (n'en fait plus partie)
            </label>
          </div>
        )}
        {r.status === 'AncienInGroup' && (
          <>
            <Field label="Dernière unité"><Input value={r.lastUnit ?? ''} onChange={(e) => onChange({ lastUnit: e.target.value })} /></Field>
            <Field label="Dernière fonction"><Input value={r.lastFunction ?? ''} onChange={(e) => onChange({ lastFunction: e.target.value })} /></Field>
          </>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={onDone}><Check className="mr-1 h-4 w-4" />Terminer</Button>
      </div>
    </div>
  )
}

// Blank per-child (step 0) form state.
function emptyChild(): DemandeInput {
  return {
    firstName: '', lastName: '', dateOfBirth: null, gender: null, nationality: null, school: null, classe: null,
    section: null, bloodType: null, medicalNotes: null, allergies: null, phoneCountryCode: null, phoneNumber: null,
    email: null, parentNotes: null,
  }
}
// Blank guardian row; the Père is defaulted as primary contact (form starts with Père + Mère rows).
function blankGuardian(rel: string): ApplicantGuardian {
  return { relationship: rel, firstName: '', lastName: '', profession: null, professionDomain: null, phoneCountryCode: '+961', phoneNumber: null, email: null, isDeceased: false, isPrimaryContact: rel === 'Père', isEmergencyContact: false }
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
  const requestLookup = useRequestHouseholdLookup()
  const verifyLookup = useVerifyHouseholdLookup()

  const [demandeId, setDemandeId] = useState(id) // 'new' until first persist creates the record, then the real id
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const [child, setChild] = useState<DemandeInput>(emptyChild()) // step 0, per-demande
  const [schoolOther, setSchoolOther] = useState(false) // école "Autre…" → free-text input instead of the managed list
  const [guardians, setGuardians] = useState<ApplicantGuardian[]>([blankGuardian('Père'), blankGuardian('Mère')]) // shared household
  const [relations, setRelations] = useState<ApplicantScoutRelation[]>([]) // shared household
  const [relEdit, setRelEdit] = useState<number | null>(null) // proche being added/edited (index; null = list view)
  const [address, setAddress] = useState({ country: 'Liban', city: '', details: '' }) // shared household
  const [primaryContactEmail, setPrimaryContactEmail] = useState('') // household primary contact email
  const [parentsSituation, setParentsSituation] = useState('') // Unis / Séparés / Divorcés (required at submit)
  // "Retrouver mes informations" — email-code-gated prefill from an existing member's household.
  const [lookupEmail, setLookupEmail] = useState('')
  const [lookupCodeSent, setLookupCodeSent] = useState(false)
  const [lookupCode, setLookupCode] = useState('')

  const existing = useMemo(() => profile?.demandes.find((d) => d.id === id), [profile, id]) // the demande being edited, if any
  // Can create/edit/submit only while the portal is open AND the submission window is open (not the CG
  // review phase). Read-only otherwise, or once this demande has already been answered.
  const canSubmit = (config?.isOpen ?? false) && (config?.submissionsOpen ?? false)
  const readonly = !canSubmit || (!!existing && !!existing.responseSentAt)
  const notesMax = config?.notesMaxLength ?? 500
  const maxRelations = config?.maxScoutRelations ?? 50

  // A demande whose response has been SENT has a dedicated result page (accepted → onboarding steps /
  // declined → reason) — send them there instead of showing the read-only wizard.
  useEffect(() => {
    if (existing?.responseSentAt) navigate(`/inscription/portail/demande/${id}/resultat`, { replace: true })
  }, [existing?.responseSentAt, id, navigate])

  // Hydrate from profile (shared data always; child only when editing existing). Multi-source hydration
  // (profile + existing + config), so it stays an effect rather than a render-phase reset.
  useEffect(() => {
    if (!profile) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (profile.guardians.length) setGuardians(profile.guardians)
    if (profile.scoutRelations.length) setRelations(profile.scoutRelations)
    setAddress({ country: profile.addressCountry ?? 'Liban', city: profile.addressCity ?? '', details: profile.addressDetails ?? '' })
    setPrimaryContactEmail(profile.primaryContactEmail ?? '')
    setParentsSituation(profile.parentsSituation ?? '')
    if (existing) {
      // Strip server-managed/metadata fields off the demande so `rest` is exactly the editable
      // DemandeInput shape for the child form. (void = silence unused-var lint on the discards.)
      const { id: _id, scoutYear, status, decisionNotes, submittedAt, responseSentAt, ...rest } = existing
      void _id; void scoutYear; void status; void decisionNotes; void submittedAt; void responseSentAt
      setChild(rest)
      if (rest.school && config && !config.schools.includes(rest.school)) setSchoolOther(true)
    }
  }, [profile, existing, config])

  if (isLoading) return <LoadingSpinner variant="page" />

  const setC = (patch: Partial<DemandeInput>) => setChild((c) => ({ ...c, ...patch }))

  // Emails offered for the household primary-contact picker: the account login + each parent's email
  // (+ the current value so it stays selected even if a parent's email later changes). Deduped, non-empty.
  const householdEmailOptions = Array.from(new Set(
    [primaryContactEmail, profile?.email, ...guardians.map((g) => g.email)].map((e) => e?.trim()).filter((e): e is string => !!e)
  ))

  // Send a one-time code to a known family email, then verify it to prefill parents/address + add the
  // family's members as proches scouts (siblings). Backend proves ownership of the address before revealing.
  const sendLookupCode = async () => {
    try { await requestLookup.mutateAsync(lookupEmail.trim()); setLookupCodeSent(true); toast.info('Si cet email est connu du groupe, un code vient d\'être envoyé.') }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const verifyLookupCode = async () => {
    try {
      const h = await verifyLookup.mutateAsync({ email: lookupEmail.trim(), code: lookupCode.trim() })
      if (h.guardians.length) setGuardians(h.guardians)
      setAddress({ country: h.addressCountry ?? 'Liban', city: h.addressCity ?? '', details: h.addressDetails ?? '' })
      setRelations((prev) => {
        const seen = new Set(prev.map((r) => r.relatedMemberId))
        const added: ApplicantScoutRelation[] = h.members.filter((m) => !seen.has(m.id)).map((m) => ({
          status: 'CurrentInGroup', relationship: 'Frère / Sœur', relatedMemberId: m.id,
          firstName: m.name.split(' ')[0] ?? '', lastName: m.name.split(' ').slice(1).join(' '), lastUnit: m.unit,
        }))
        return [...prev, ...added]
      })
      toast.success('Informations de la famille pré-remplies.')
      setLookupCodeSent(false); setLookupCode('')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  // ── validation ──
  function validateStep(s: number): Errors {
    const e: Errors = {}
    if (s === 0) {
      if (!child.firstName?.trim()) e.firstName = 'Requis'
      if (!child.lastName?.trim()) e.lastName = 'Requis'
      if (!child.dateOfBirth) e.dateOfBirth = 'Requis'
      else {
        // Not in the future, and not absurdly old — catches a year typo (e.g. 1816/1916) from the manual
        // JJ/MM/AAAA input. 30 years is generous (oldest realistic new scout ~21); mirrors the server rule.
        const dob = new Date(child.dateOfBirth), now = new Date()
        const floor = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate())
        if (dob > now || dob < floor) e.dateOfBirth = 'Date invalide'
      }
      if (!child.gender) e.gender = 'Requis'
      if (!child.nationality?.trim()) e.nationality = 'Requis'
      if (!child.school?.trim()) e.school = 'Requis'
      if (!child.classe?.trim()) e.classe = 'Requis'
      if (child.email && !emailRe.test(child.email)) e.email = 'Email invalide'
    }
    if (s === 1) {
      const filled = guardians.filter((g) => g.firstName.trim() || g.lastName.trim())
      if (filled.length === 0) e.guardians = 'Renseignez au moins un parent / tuteur.'
      // Match the guardians state indices so the error shows on the right row.
      guardians.forEach((g, i) => {
        if (!(g.firstName.trim() || g.lastName.trim())) return
        if (!g.firstName.trim()) e[`g_${i}_first`] = 'Requis'
        if (!g.lastName.trim()) e[`g_${i}_last`] = 'Requis'
        if (!g.isDeceased && !g.phoneNumber?.trim()) e[`g_${i}_phone`] = 'Téléphone requis' // #3
        if (g.email && !emailRe.test(g.email)) e[`g_${i}_email`] = 'Email invalide'
      })
      if (!parentsSituation) e.parentsSituation = 'Requis' // #4
    }
    return e
  }

  // Saves everything to the server: first the shared household (parents/relations/address — common
  // to all of the account's children), then the child demande (create on first save, else update).
  // Returns the demande id (newly created or existing) so callers can chain submit. Blank
  // guardian/relation rows are filtered out before sending.
  async function persist(): Promise<string | null> {
    // shared household
    await householdMutation.mutateAsync({
      contactName: profile?.contactName ?? null,
      addressCountry: address.country, addressCity: address.city, addressDetails: address.details,
      primaryContactEmail: primaryContactEmail || null,
      parentsSituation: parentsSituation || null,
      guardians: guardians.filter((g) => g.firstName.trim() || g.lastName.trim()),
      scoutRelations: relations.filter((r) => r.firstName?.trim() || r.lastName?.trim() || r.relatedMemberId),
    })
    // demande
    if (demandeId === 'new') {
      const res = await createMutation.mutateAsync(child)
      setDemandeId(res.id)
      // Swap the URL to the real id without a navigation, so a refresh/back stays on this demande.
      window.history.replaceState(null, '', `/inscription/portail/demande/${res.id}`)
      return res.id
    } else {
      await updateMutation.mutateAsync({ id: demandeId, data: child })
      return demandeId
    }
  }

  // After a validation failure, bring the first highlighted field into view — on a long mobile form the
  // failing field (e.g. a parent's phone or the "Situation des parents") is often far from the button, so a
  // parent seeing only the toast wouldn't know where to look. Delayed so the error borders have rendered.
  const scrollToFirstError = () => {
    setTimeout(() => document.querySelector('.border-destructive')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  // Stepper/Précédent/Suivant navigation. Read-only just jumps. Moving forward validates the
  // current step first (blocks on errors), then persists progress before switching steps; going
  // backward still persists but skips validation.
  async function go(target: number) {
    if (readonly) { setStep(target); return }
    // validate when moving forward past a gated step
    if (target > step) {
      const e = validateStep(step)
      if (Object.keys(e).length) { setErrors(e); toast.error('Veuillez corriger les champs indiqués.'); scrollToFirstError(); return }
    }
    setErrors({})
    setSaving(true)
    try { await persist() } catch (err) { toast.error(parseApiError(err)); setSaving(false); return }
    setSaving(false)
    setStep(target)
  }

  // Final submit (step 3): re-validates the two gated steps (0 child, 1 parents) regardless of how
  // the user navigated here, jumping back to the first step that has errors; then persists and
  // transitions the demande to Submitted before returning to the portail.
  async function handleSubmit() {
    const e0 = validateStep(0), e1 = validateStep(1)
    const all = { ...e0, ...e1 }
    if (Object.keys(all).length) { setErrors(all); setStep(Object.keys(e0).length ? 0 : 1); toast.error('Informations incomplètes.'); scrollToFirstError(); return }
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
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate('/inscription/portail')}><ChevronLeft className="mr-1 h-4 w-4" />Retour</Button>
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
              {/* Surfaced at the very START (was buried on step 2): the household prefill is the biggest
                  time-saver when a SIBLING is already a member — the family (parents/address) is already on
                  file. Shown only until the parents are filled, i.e. effectively on the first child; the next
                  child inherits the same household automatically. */}
              {!readonly && guardians.every(g => !g.firstName?.trim()) && (
                <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-start gap-2">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Un frère ou une sœur est déjà membre du groupe&nbsp;? Retrouvez les informations de votre famille (parents, adresse) déjà enregistrées, pour ne pas les ressaisir.
                  </span>
                  <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setStep(1)}>Retrouver mes informations</Button>
                </div>
              )}
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
                  {/* On blur, snap a typed school name onto the canonical list (accent/case-insensitive) to dedupe spellings; collapse back to the select if it matched. */}
                  {schoolOther && <Input className="mt-2" placeholder="Nom de l'école" value={child.school ?? ''} onChange={(e) => setC({ school: e.target.value })}
                    onBlur={(e) => { const matched = matchSchool(e.target.value, config?.schools ?? []); setC({ school: matched }); if ((config?.schools ?? []).includes(matched)) setSchoolOther(false) }} />}
                </Field>
                <Field label="Classe" required error={errors.classe}>
                  {(config?.classes?.length ?? 0) > 0 ? (
                    <Select value={child.classe ?? ''} onValueChange={(v) => setC({ classe: v })}>
                      <SelectTrigger className={errors.classe ? 'border-destructive' : ''}><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                      {/* Exclude the non-eligible grade (default 6ème, from demande.excluded_classe) from the options. */}
                      <SelectContent>{(config?.classes ?? []).filter((c) => c !== config?.excludedClasse).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input value={child.classe ?? ''} onChange={(e) => setC({ classe: e.target.value })} className={errors.classe ? 'border-destructive' : ''} />
                  )}
                  {config?.excludedClasse && (
                    <p className="mt-1 text-xs text-muted-foreground">Un enfant en {config.excludedClasse} ne peut pas s'inscrire.</p>
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
                  <Input type="tel" inputMode="tel" value={child.phoneNumber ?? ''} onChange={(e) => setC({ phoneNumber: e.target.value || null })} />
                </Field>
              </div>
              <Field label="Allergies"><Input value={child.allergies ?? ''} onChange={(e) => setC({ allergies: e.target.value || null })} /></Field>
              <Field label="Notes médicales"><Input value={child.medicalNotes ?? ''} onChange={(e) => setC({ medicalNotes: e.target.value || null })} /></Field>
              <Field label={`Notes / demandes particulières (${(child.parentNotes ?? '').length}/${notesMax})`}>
                <textarea value={child.parentNotes ?? ''} maxLength={notesMax} onChange={(e) => setC({ parentNotes: e.target.value || null })}
                  className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-2xs focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  placeholder="Ex. : préférence d'unité, informations utiles…" />
              </Field>
              <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="shrink-0" checked={!!child.hasPreviousDemande}
                    onChange={(e) => setC({ hasPreviousDemande: e.target.checked, previousDemandeYear: e.target.checked ? child.previousDemandeYear ?? null : null })} />
                  <span>Une demande a déjà été présentée pour cet enfant</span>
                </label>
                {child.hasPreviousDemande && (
                  <Field label="Année de la demande précédente">
                    <Input value={child.previousDemandeYear ?? ''} onChange={(e) => setC({ previousDemandeYear: e.target.value || null })} placeholder="Ex. : 2025-2026" className="max-w-xs" />
                  </Field>
                )}
              </div>
            </fieldset>
          )}

          {/* STEP 1 — parents */}
          {step === 1 && (
            <fieldset disabled={readonly} className="space-y-4">
              {/* Prefill from an existing member's household (email-code gated). Only on the FIRST child (parents
                  not filled yet) — the next child inherits the same household automatically. */}
              {!readonly && guardians.every(g => !g.firstName?.trim()) && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="text-sm font-semibold">Un frère ou une sœur est déjà membre du groupe&nbsp;?</div>
                <p className="text-xs text-muted-foreground">Recevez un code par email pour retrouver et pré-remplir les informations de votre famille (parents, adresse, frères et sœurs). Utilisez votre email ou celui d'un parent déjà connu du groupe.</p>
                {!lookupCodeSent ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input type="email" placeholder="Votre email ou celui d'un parent" value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)} className="w-full sm:max-w-xs" />
                    <Button type="button" variant="outline" size="sm" disabled={!lookupEmail.trim() || requestLookup.isPending} onClick={sendLookupCode}>
                      {requestLookup.isPending ? 'Envoi...' : 'Envoyer le code'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input inputMode="numeric" placeholder="Code reçu par email" value={lookupCode} onChange={(e) => setLookupCode(e.target.value)} className="w-full sm:max-w-[12rem]" />
                      <Button type="button" size="sm" disabled={!lookupCode.trim() || verifyLookup.isPending} onClick={verifyLookupCode}>
                        {verifyLookup.isPending ? 'Vérification...' : 'Vérifier et pré-remplir'}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setLookupCodeSent(false); setLookupCode('') }}>Changer l'email</Button>
                    </div>
                    {/* Persistent guidance — the "code sent" toast auto-dismisses; a parent staring at this field
                        needs a lasting reminder to check email (incl. spam). */}
                    <p className="text-xs text-muted-foreground">Saisissez le code reçu par email (pensez à vérifier les courriers indésirables).</p>
                  </div>
                )}
              </div>
              )}

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
                    <Field label="Domaine">
                      <SearchableSelect value={g.professionDomain ?? ''} onValueChange={(v) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, professionDomain: v } : x))} options={(config?.professionDomains ?? []).map((d) => ({ value: d, label: d }))} placeholder="Domaine d'activité..." searchPlaceholder="Rechercher un domaine..." />
                    </Field>
                    <Field label="Profession (texte libre)">
                      <Input value={g.profession ?? ''} maxLength={150} placeholder="Profession (ex. Ingénieure)" onChange={(e) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, profession: e.target.value } : x))} />
                    </Field>
                    <Field label="Téléphone" required={!g.isDeceased} error={errors[`g_${i}_phone`]}>
                      <Input type="tel" inputMode="tel" value={g.phoneNumber ?? ''} onChange={(e) => setGuardians((arr) => arr.map((x, j) => j === i ? { ...x, phoneNumber: e.target.value } : x))} className={errors[`g_${i}_phone`] ? 'border-destructive' : ''} />
                    </Field>
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

              <div className="pt-2 sm:max-w-xs">
                <Field label="Situation des parents" required error={errors.parentsSituation}>
                  <Select value={parentsSituation || undefined} onValueChange={setParentsSituation}>
                    <SelectTrigger className={errors.parentsSituation ? 'border-destructive' : ''}><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Unis">Unis</SelectItem>
                      <SelectItem value="Séparés">Séparés</SelectItem>
                      <SelectItem value="Divorcés">Divorcés</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="pt-2">
                <div className="text-sm font-semibold text-muted-foreground mb-2">Adresse du domicile</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Pays"><Input value={address.country} onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))} /></Field>
                  <Field label="Ville"><CitySelect value={address.city} onChange={(city) => setAddress((a) => ({ ...a, city }))} cities={config?.cities ?? []} /></Field>
                  <Field label="Adresse"><Input value={address.details} onChange={(e) => setAddress((a) => ({ ...a, details: e.target.value }))} /></Field>
                </div>
              </div>

              <div className="pt-2">
                <Field label="Courriel de contact principal">
                  <Select value={primaryContactEmail || '__none'} onValueChange={(v) => setPrimaryContactEmail(v === '__none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Choisir une adresse..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Aucun (par défaut)</SelectItem>
                      {householdEmailOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <p className="mt-1 text-xs text-muted-foreground">L'adresse qui recevra les communications du groupe (identifiants, informations). Une seule pour toute la famille.</p>
              </div>
            </fieldset>
          )}

          {/* STEP 2 — scout relations */}
          {step === 2 && (
            <fieldset disabled={readonly} className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Link2 className="h-4 w-4" />Proches déjà scouts <span className="font-normal">(optionnel, communs à tous vos enfants)</span></div>
              <p className="text-sm text-muted-foreground">Frères, sœurs ou proches qui sont ou ont été scouts. Cela nous aide à regrouper les familles.</p>
              <p className="text-xs text-muted-foreground">{relations.length} / {maxRelations} proches ajoutés (maximum {maxRelations}).</p>
              {/* Compact list of added proches — click Modifier to edit one in the form below. */}
              {relations.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Nom</th>
                        <th className="px-3 py-2 font-medium">Situation</th>
                        <th className="hidden px-3 py-2 font-medium sm:table-cell">Lien</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relations.map((r, i) => (
                        <tr key={i} className={`border-t ${relEdit === i ? 'bg-primary/5' : ''}`}>
                          <td className="px-3 py-2 font-medium">{[r.firstName, r.lastName].filter(Boolean).join(' ') || <span className="italic text-muted-foreground">(sans nom)</span>}</td>
                          <td className="px-3 py-2 text-muted-foreground">{rStatusLabel(r.status)}</td>
                          <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">{r.relationship ?? '—'}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              {!readonly && <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setRelEdit(i)}><Pencil className="h-4 w-4" /></Button>}
                              {!readonly && <Button type="button" variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setRelations((arr) => arr.filter((_, j) => j !== i)); setRelEdit((cur) => cur === i ? null : (cur != null && cur > i ? cur - 1 : cur)) }}><Trash2 className="h-4 w-4" /></Button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Edit form for the selected / newly-added proche. */}
              {!readonly && relEdit !== null && relations[relEdit] && (
                <RelationEditForm
                  r={relations[relEdit]}
                  units={config?.units ?? []}
                  onChange={(patch) => setRelations((arr) => arr.map((x, j) => j === relEdit ? { ...x, ...patch } : x))}
                  onDone={() => {
                    // Drop a proche left without a name when finishing.
                    setRelations((arr) => arr.filter((x, j) => j !== relEdit || !!(x.firstName?.trim() || x.lastName?.trim())))
                    setRelEdit(null)
                  }}
                />
              )}

              {!readonly && relEdit === null && (
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" disabled={relations.length >= maxRelations} onClick={() => { setRelations((arr) => [...arr, { status: 'CurrentInGroup', relationship: null, firstName: '', lastName: '', relatedMemberId: null }]); setRelEdit(relations.length) }}><Plus className="mr-1 h-4 w-4" />Ajouter un proche</Button>
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
                {parentsSituation && <p className="text-muted-foreground mt-1">Situation des parents : {parentsSituation}</p>}
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
