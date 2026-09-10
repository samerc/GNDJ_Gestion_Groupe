// CG/admin edit form for a full demande file — child fields + the shared household (address, situation,
// parents/tuteurs, proches scouts). Rendered inside the review drawer (replaces the read-only sections while
// editing). Mirrors the applicant wizard's field patterns/components so the data shape + validation match, but
// posts to the CG endpoint (PUT /demandes/{id}) which bypasses the submission deadline. Editing the household
// affects EVERY sibling demande on the same account (guardians + address are shared) — noted in the UI.
import { useMemo, useState } from 'react'
import { useAdminEditDemande, type AdminEditHousehold, type DemandeReview } from '@/services/demande-admin-service'
import type { ApplicantGuardian, ApplicantScoutRelation, DemandeInput } from '@/services/applicant-service'
import { useSettingArray, useCities, matchSchool } from '@/services/settings-service'
import { useUnits } from '@/services/unit-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { CitySelect } from '@/components/shared/city-select'
import { DateInput } from '@/components/shared/date-input'
import { PhoneInput } from '@/components/ui/phone-input'
import { NATIONALITY_OPTIONS } from '@/lib/options'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { Plus, Trash2, Save, X, User, Users2, Tent, MapPin, HeartPulse, MessageSquare } from 'lucide-react'

// Local constants mirror the applicant wizard (kept small + local so this stays self-contained).
const GENDERS = ['Masculin', 'Féminin']
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const G_REL = ['Père', 'Mère', 'Tuteur', 'Tutrice', 'Autre']
const R_REL = ['Père / Mère', 'Frère / Sœur', 'Cousin / Cousine', 'Oncle / Tante']
const SITUATIONS = ['Unis', 'Séparés', 'Divorcés']
const R_STATUS: { value: string; label: string }[] = [
  { value: 'CurrentInGroup', label: 'Membre actuel du Groupe' },
  { value: 'AncienInGroup', label: 'Ancien membre du Groupe' },
  { value: 'OtherGroup', label: 'Scout dans un autre groupe' },
]

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function SectionCard({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      {children}
    </div>
  )
}

export function DemandeEditForm({ d, onSaved, onCancel }: { d: DemandeReview; onSaved: () => void; onCancel: () => void }) {
  const edit = useAdminEditDemande()
  const cities = useCities()
  const schools = useSettingArray('member.schools')
  const classes = useSettingArray('member.classes')
  const professionDomains = useSettingArray('member.profession_domains')
  const { data: unitsData } = useUnits({ isActive: true, pageSize: 200 })
  const unitNames = useMemo(
    () => (unitsData?.items ?? []).map((u) => u.name).sort((a, b) => a.localeCompare(b)),
    [unitsData],
  )

  // Child (Demande) fields — seeded from the review row.
  const [firstName, setFirstName] = useState(d.firstName)
  const [lastName, setLastName] = useState(d.lastName)
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(d.dateOfBirth)
  const [gender, setGender] = useState(d.gender ?? '')
  const [nationality, setNationality] = useState(d.nationality ?? '')
  const [school, setSchool] = useState(d.school ?? '')
  const [classe, setClasse] = useState(d.classe ?? '')
  const [section, setSection] = useState(d.section ?? '')
  const [bloodType, setBloodType] = useState(d.bloodType ?? '')
  // This PhoneInput has no country picker (dialCode is display-only), so the child's dial code is kept as-is.
  const phoneCode = d.phoneCountryCode ?? '+961'
  const [phone, setPhone] = useState(d.phoneNumber ?? '')
  const [email, setEmail] = useState(d.email ?? '')
  const [allergies, setAllergies] = useState(d.allergies ?? '')
  const [medicalNotes, setMedicalNotes] = useState(d.medicalNotes ?? '')
  const [parentNotes, setParentNotes] = useState(d.parentNotes ?? '')
  const [hasPrev, setHasPrev] = useState(!!d.hasPreviousDemande)
  const [prevYear, setPrevYear] = useState(d.previousDemandeYear ?? '')

  // Household (account) fields — shared across siblings.
  const [contactName, setContactName] = useState(d.contactName ?? '')
  const [addressCity, setAddressCity] = useState(d.addressCity ?? '')
  const [addressCountry, setAddressCountry] = useState(d.addressCountry ?? 'Liban')
  const [addressDetails, setAddressDetails] = useState(d.addressDetails ?? '')
  const [parentsSituation, setParentsSituation] = useState(d.parentsSituation ?? '')
  const [guardians, setGuardians] = useState<ApplicantGuardian[]>(() => d.guardians.map((g) => ({ ...g })))
  const [relations, setRelations] = useState<ApplicantScoutRelation[]>(() => d.scoutRelations.map((r) => ({ ...r })))

  const setG = (i: number, patch: Partial<ApplicantGuardian>) =>
    setGuardians((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setR = (i: number, patch: Partial<ApplicantScoutRelation>) =>
    setRelations((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Le prénom et le nom de l’enfant sont requis.')
      return
    }
    const child: DemandeInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
      gender: gender || null,
      nationality: nationality || null,
      school: school || null,
      classe: classe || null,
      section: section || null,
      bloodType: bloodType || null,
      medicalNotes: medicalNotes || null,
      allergies: allergies || null,
      phoneCountryCode: phoneCode || null,
      phoneNumber: phone || null,
      email: email || null,
      parentNotes: parentNotes || null,
      hasPreviousDemande: hasPrev,
      previousDemandeYear: hasPrev ? prevYear || null : null,
    }
    const household: AdminEditHousehold = {
      contactName: contactName || null,
      addressCountry: addressCountry || null,
      addressCity: addressCity || null,
      addressDetails: addressDetails || null,
      parentsSituation: parentsSituation || null,
      // Keep only guardians/relations with at least a name (empty rows are dropped server-side anyway).
      guardians: guardians.filter((g) => g.firstName.trim() || g.lastName.trim()),
      scoutRelations: relations.filter((r) => (r.firstName ?? '').trim() || (r.lastName ?? '').trim()),
    }
    try {
      await edit.mutateAsync({ id: d.id, child, household })
      toast.success('Demande mise à jour.')
      onSaved()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-muted/30 p-5">
        <h2 className="text-lg font-bold">Modifier la demande</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Les coordonnées, parents et proches sont partagés avec les autres demandes de ce compte (fratrie).
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* Child */}
        <SectionCard icon={User} title="Enfant">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prénom">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Nom">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Date de naissance">
              <DateInput value={dateOfBirth} onChange={setDateOfBirth} />
            </Field>
            <Field label="Genre">
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Nationalité">
              <SearchableSelect value={nationality} onValueChange={setNationality} options={NATIONALITY_OPTIONS} pinnedValues={['Libanaise']} searchPlaceholder="Rechercher une nationalité..." />
            </Field>
            <Field label="Groupe sanguin">
              <Select value={bloodType} onValueChange={setBloodType}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{BLOOD.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="École">
              <Input value={school} onChange={(e) => setSchool(e.target.value)} onBlur={() => setSchool((s) => (s ? matchSchool(s, schools) : s))} list="edit-schools" />
              <datalist id="edit-schools">{schools.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Classe">
              <Select value={classe} onValueChange={setClasse}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Section">
              <Input value={section} maxLength={20} onChange={(e) => setSection(e.target.value)} />
            </Field>
            <Field label="Téléphone enfant">
              <PhoneInput dialCode={phoneCode} value={phone} onChange={setPhone} />
            </Field>
            <Field label="Courriel enfant" className="sm:col-span-2">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasPrev} onChange={(e) => setHasPrev(e.target.checked)} />
            Demande précédente
            {hasPrev && (
              <Input className="ml-2 h-8 w-28" value={prevYear} placeholder="Année" onChange={(e) => setPrevYear(e.target.value)} />
            )}
          </label>
        </SectionCard>

        {/* Household coordinates */}
        <SectionCard icon={MapPin} title="Coordonnées du foyer">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Responsable du compte">
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="Situation des parents">
              <Select value={parentsSituation} onValueChange={setParentsSituation}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{SITUATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Ville">
              <CitySelect value={addressCity} onChange={setAddressCity} cities={cities} />
            </Field>
            <Field label="Pays">
              <Input value={addressCountry} onChange={(e) => setAddressCountry(e.target.value)} />
            </Field>
            <Field label="Adresse (détails)" className="sm:col-span-2">
              <Input value={addressDetails} onChange={(e) => setAddressDetails(e.target.value)} />
            </Field>
          </div>
        </SectionCard>

        {/* Guardians */}
        <SectionCard icon={Users2} title={`Parents / Tuteurs (${guardians.length})`}>
          <div className="space-y-3">
            {guardians.map((g, i) => (
              <div key={i} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Select value={g.relationship} onValueChange={(v) => setG(i, { relationship: v })}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Lien" /></SelectTrigger>
                    <SelectContent>{G_REL.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setGuardians((arr) => arr.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Prénom"><Input value={g.firstName} onChange={(e) => setG(i, { firstName: e.target.value })} /></Field>
                  <Field label="Nom"><Input value={g.lastName} onChange={(e) => setG(i, { lastName: e.target.value.toUpperCase() })} /></Field>
                  <Field label="Domaine">
                    <SearchableSelect value={g.professionDomain ?? ''} onValueChange={(v) => setG(i, { professionDomain: v })} options={professionDomains.map((x) => ({ value: x, label: x }))} placeholder="Domaine..." searchPlaceholder="Rechercher..." />
                  </Field>
                  <Field label="Profession"><Input value={g.profession ?? ''} maxLength={150} onChange={(e) => setG(i, { profession: e.target.value })} /></Field>
                  <Field label="Téléphone"><PhoneInput dialCode={g.phoneCountryCode ?? '+961'} value={g.phoneNumber ?? ''} onChange={(v) => setG(i, { phoneNumber: v })} /></Field>
                  <Field label="Email"><Input type="email" value={g.email ?? ''} onChange={(e) => setG(i, { email: e.target.value })} /></Field>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={g.isPrimaryContact} onChange={(e) => setG(i, { isPrimaryContact: e.target.checked })} />Contact principal</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={g.isEmergencyContact} onChange={(e) => setG(i, { isEmergencyContact: e.target.checked })} />Urgence</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={g.isDeceased} onChange={(e) => setG(i, { isDeceased: e.target.checked })} />Décédé(e)</label>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setGuardians((arr) => [...arr, { relationship: 'Père', firstName: '', lastName: '', isDeceased: false, isPrimaryContact: false, isEmergencyContact: false }])}>
              <Plus className="mr-1 h-4 w-4" />Ajouter un parent / tuteur
            </Button>
          </div>
        </SectionCard>

        {/* Scout relations */}
        <SectionCard icon={Tent} title={`Proches scouts (${relations.length})`}>
          <div className="space-y-3">
            {relations.map((r, i) => (
              <div key={i} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Select value={r.status} onValueChange={(v) => setR(i, { status: v })}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Situation" /></SelectTrigger>
                    <SelectContent>{R_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRelations((arr) => arr.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Prénom"><Input value={r.firstName ?? ''} onChange={(e) => setR(i, { firstName: e.target.value })} /></Field>
                  <Field label="Nom"><Input value={r.lastName ?? ''} onChange={(e) => setR(i, { lastName: e.target.value.toUpperCase() })} /></Field>
                  <Field label="Lien de parenté">
                    <Select value={r.relationship ?? ''} onValueChange={(v) => setR(i, { relationship: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{R_REL.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  {r.status === 'CurrentInGroup' && (
                    <Field label="Unité actuelle">
                      {unitNames.length > 0 ? (
                        <Select value={r.lastUnit ?? ''} onValueChange={(v) => setR(i, { lastUnit: v })}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{unitNames.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input value={r.lastUnit ?? ''} onChange={(e) => setR(i, { lastUnit: e.target.value })} />
                      )}
                    </Field>
                  )}
                  {r.status === 'AncienInGroup' && (
                    <>
                      <Field label="Dernière unité"><Input value={r.lastUnit ?? ''} onChange={(e) => setR(i, { lastUnit: e.target.value })} /></Field>
                      <Field label="Dernière fonction"><Input value={r.lastFunction ?? ''} onChange={(e) => setR(i, { lastFunction: e.target.value })} /></Field>
                    </>
                  )}
                  {r.status === 'OtherGroup' && (
                    <>
                      <Field label="Nom du groupe"><Input value={r.otherGroupName ?? ''} onChange={(e) => setR(i, { otherGroupName: e.target.value })} /></Field>
                      <div className="flex items-end pb-1.5">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={!!r.otherGroupIsFormer} onChange={(e) => setR(i, { otherGroupIsFormer: e.target.checked })} />
                          Ancien de ce groupe
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRelations((arr) => [...arr, { status: 'CurrentInGroup', firstName: '', lastName: '' }])}>
              <Plus className="mr-1 h-4 w-4" />Ajouter un proche scout
            </Button>
          </div>
        </SectionCard>

        {/* Medical + parent note */}
        <SectionCard icon={HeartPulse} title="Médical">
          <div className="space-y-3">
            <Field label="Allergies"><Input value={allergies} onChange={(e) => setAllergies(e.target.value)} /></Field>
            <Field label="Notes médicales"><Input value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} /></Field>
          </div>
        </SectionCard>

        <SectionCard icon={MessageSquare} title="Note des parents">
          <textarea className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" value={parentNotes} onChange={(e) => setParentNotes(e.target.value)} />
        </SectionCard>
      </div>

      {/* Footer */}
      <div className="flex gap-2 border-t bg-background p-5">
        <Button className="flex-1" onClick={save} disabled={edit.isPending}>
          <Save className="mr-1 h-4 w-4" />Enregistrer
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={edit.isPending}>
          <X className="mr-1 h-4 w-4" />Annuler
        </Button>
      </div>
    </div>
  )
}
