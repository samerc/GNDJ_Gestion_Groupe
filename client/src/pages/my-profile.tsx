import { useAuthStore } from '@/stores/auth-store'
import { useMember, type MemberFormData } from '@/services/member-service'
import { useUpdateMyProfile } from '@/services/my-profile-service'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { MemberPhoto } from '@/components/shared/member-photo'
import { MemberAssignments } from '@/components/members/member-assignments'
import { MemberGuardians } from '@/components/members/member-guardians'
import { MemberSiblings } from '@/components/members/member-siblings'
import { HouseholdContacts } from '@/components/members/household-contacts'
import { DocumentsCta } from '@/components/members/documents-cta'
import { MemberProgression } from '@/components/members/member-progression'
import { MemberCustomFields } from '@/components/members/member-custom-fields'
import { useSettingArray } from '@/services/settings-service'
import { SchoolSelect } from '@/components/shared/school-select'
import { parseApiError } from '@/lib/error-utils'
import { BLOOD_TYPE_OPTIONS, NATIONALITY_OPTIONS, PARENTS_SITUATION_OPTIONS } from '@/lib/options'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { PERMISSIONS } from '@/lib/constants'
import { Save, User } from 'lucide-react'
import { toast } from 'sonner'

export default function MyProfilePage() {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [activeTab, setActiveTab] = useState('profile')
  const canManageOwnAssignments = hasPermission(PERMISSIONS.ASSIGNMENTS_CREATE)
  const memberId = user?.memberId ?? ''
  const { data: member, isLoading } = useMember(memberId)
  // Ma fiche is always the caller's OWN record, so it uses the self-service endpoint (no members.edit
  // needed, and locked identity fields are never sent). Editable: nationalité/école/classe/section/
  // groupe sanguin + médical — no approval. Coordonnées (own + parents) live in <HouseholdContacts>.
  const updateMutation = useUpdateMyProfile(memberId)
  const pinnedNationalities = useSettingArray('pinned_nationalities')
  const schools = useSettingArray('member.schools')
  const classes = useSettingArray('member.classes')
  const professionDomains = useSettingArray('member.profession_domains')

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<MemberFormData>({ firstName: '', lastName: '' })
  // "Situation" toggle: 'student' shows Classe/Section, 'working' shows Domaine/Profession (hidden side cleared on save).
  const [situation, setSituation] = useState<'student' | 'working'>('student')
  const [error, setError] = useState('')

  useUnsavedChanges(editing)

  const startEdit = () => {
    if (!member) return
    setForm({
      firstName: member.firstName, lastName: member.lastName,
      dateOfBirth: member.dateOfBirth ?? '', gender: member.gender ?? '',
      cardNumber: member.cardNumber ?? '', externalCardNumber: member.externalCardNumber ?? '',
      bloodType: member.bloodType ?? '',
      nationality: member.nationality ?? '', school: member.school ?? '',
      classe: member.classe ?? '', professionDomain: member.professionDomain ?? '', profession: member.profession ?? '', section: member.section ?? '',
      medicalNotes: member.medicalNotes ?? '', allergies: member.allergies ?? '',
      notes: member.notes ?? '', parentsSituation: member.parentsSituation ?? '',
    })
    setSituation(member.showProfession && (member.professionDomain || member.profession) ? 'working' : 'student')
    setError('')
    setEditing(true)
  }

  const handleSave = async () => {
    setError('')
    try {
      // Only the member-editable fields are sent; locked identity fields (name/DOB/gender/card numbers)
      // are never part of the self-service update.
      await updateMutation.mutateAsync({
        nationality: form.nationality || null,
        school: form.school || null,
        // Mutually exclusive by situation (student keeps classe/section, working keeps domaine/profession).
        classe: situation === 'student' ? (form.classe || null) : null,
        section: situation === 'student' ? (form.section || null) : null,
        professionDomain: situation === 'working' ? (form.professionDomain || null) : null,
        profession: situation === 'working' ? (form.profession || null) : null,
        bloodType: form.bloodType || null,
        parentsSituation: form.parentsSituation || null,
        allergies: form.allergies || null,
        medicalNotes: form.medicalNotes || null,
      })
      toast.success('Fiche mise à jour')
      setEditing(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  if (isLoading || !member) return <LoadingSpinner variant="profile" />

  return (
    <Page size="narrow">
      {/* Header: title + the synthetic login (truncated — prenom.nom@scouts.gndj can be long).
          The Modifier button edits the Profil + Médical fields, so it only shows on those tabs;
          other tabs (Contact & famille, Documents…) have their own inline add/edit actions. */}
      <PageHeader
        title="Ma fiche"
        icon={User}
        avatar={member ? <MemberPhoto memberId={memberId} name={`${member.firstName} ${member.lastName}`} photoPath={member.photoPath} size={48} editable rounded="rounded-xl" /> : undefined}
        description={<span className="block truncate">{user?.email}</span>}
        actions={(activeTab === 'profile' || activeTab === 'medical') && (
          !editing ? (
            <Button onClick={startEdit}>Modifier</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="mr-1.5 h-4 w-4" />{updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          )
        )}
      />

      {/* Members mostly log in to upload documents — surface their dossier + completion right on Ma fiche. */}
      <DocumentsCta memberId={memberId} />

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v !== 'profile' && v !== 'medical') setEditing(false) }}>
        <TabsList className="overflow-x-auto flex-nowrap">
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="contact">Contact &amp; famille</TabsTrigger>
          <TabsTrigger value="assignments">Unités / Fonctions</TabsTrigger>
          <TabsTrigger value="medical">Médical &amp; infos</TabsTrigger>
          <TabsTrigger value="progression">Progression</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Informations personnelles</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Le nom, le prénom, la date de naissance, le sexe et le matricule sont gérés par la maîtrise. Contactez vos chefs pour toute correction.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Locked identity fields — admin-controlled; a member can view but not change them. */}
                  <div className="space-y-2"><RequiredLabel>Prénom</RequiredLabel><Input value={member.firstName} disabled /></div>
                  <div className="space-y-2"><RequiredLabel>Nom</RequiredLabel><Input value={member.lastName} disabled /></div>
                  <div className="space-y-2"><RequiredLabel>Date de naissance</RequiredLabel><Input value={member.dateOfBirth ? new Date(member.dateOfBirth).toLocaleDateString('fr-FR') : ''} disabled /></div>
                  <div className="space-y-2"><RequiredLabel>Sexe</RequiredLabel><Input value={member.gender ?? ''} disabled /></div>
                  <div className="space-y-2"><RequiredLabel>Matricule</RequiredLabel><Input value={member.cardNumber ?? ''} disabled /></div>
                  <div className="space-y-2">
                    <RequiredLabel>Nationalité</RequiredLabel>
                    <SearchableSelect value={form.nationality ?? ''} onValueChange={(v) => setForm(f => ({ ...f, nationality: v }))} options={NATIONALITY_OPTIONS} pinnedValues={pinnedNationalities} searchPlaceholder="Rechercher..." />
                  </div>
                  <div className="space-y-2">
                    <RequiredLabel>Groupe sanguin</RequiredLabel>
                    <Select value={form.bloodType ?? ''} onValueChange={(v) => setForm(f => ({ ...f, bloodType: v }))}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                      <SelectContent>{BLOOD_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <RequiredLabel>Situation des parents</RequiredLabel>
                    <Select value={form.parentsSituation || ''} onValueChange={(v) => setForm(f => ({ ...f, parentsSituation: v === '__clear__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Non précisé" /></SelectTrigger>
                      <SelectContent>
                        {form.parentsSituation && <SelectItem value="__clear__">— Non précisé —</SelectItem>}
                        {PARENTS_SITUATION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <RequiredLabel required>École</RequiredLabel>
                    {/* Searchable dropdown + "Autre…" free-text (snaps typed variants onto the canonical school). */}
                    <SchoolSelect value={form.school || ''} onChange={(v) => setForm(f => ({ ...f, school: v }))} schools={schools} />
                  </div>
                  {/* Situation toggle — only for older members (a youth in Meute/Ronde/Compagnie/Troupe stays
                      Classe/Section; member.showProfession is false there so the toggle is hidden). */}
                  {member.showProfession && (
                    <div className="space-y-2 sm:col-span-2">
                      <RequiredLabel>Situation</RequiredLabel>
                      <div className="inline-flex h-9 items-center rounded-md border p-0.5">
                        <button type="button" onClick={() => setSituation('student')}
                          className={cn('h-full rounded px-3 text-sm font-medium transition-colors', situation === 'student' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                          Scolarisé(e)
                        </button>
                        <button type="button" onClick={() => setSituation('working')}
                          className={cn('h-full rounded px-3 text-sm font-medium transition-colors', situation === 'working' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                          En activité
                        </button>
                      </div>
                    </div>
                  )}
                  {situation === 'student' ? (
                    <>
                      <div className="space-y-2">
                        <RequiredLabel>Classe</RequiredLabel>
                        <Select value={form.classe || ''} onValueChange={(v) => setForm(f => ({ ...f, classe: v === '__clear__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            {form.classe && <SelectItem value="__clear__">— Aucune —</SelectItem>}
                            {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <RequiredLabel>Section</RequiredLabel>
                        <Input value={form.section || ''} onChange={(e) => setForm(f => ({ ...f, section: e.target.value.slice(0, 5) }))} placeholder="Ex: SV, SE..." maxLength={5} />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Working member (Clan/Noyau/maîtrise): Domaine category + free-text job title. */}
                      <div className="space-y-2">
                        <RequiredLabel>Domaine</RequiredLabel>
                        <Select value={form.professionDomain || ''} onValueChange={(v) => setForm(f => ({ ...f, professionDomain: v === '__clear__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            {form.professionDomain && <SelectItem value="__clear__">— Aucun —</SelectItem>}
                            {professionDomains.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <RequiredLabel>Profession</RequiredLabel>
                        <Input value={form.profession || ''} onChange={(e) => setForm(f => ({ ...f, profession: e.target.value }))} placeholder="Ex: Ingénieur, Médecin..." maxLength={150} />
                      </div>
                    </>
                  )}
                </div>
                </div>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Prénom" value={member.firstName} />
                  <Field label="Nom" value={member.lastName} />
                  <Field label="Date de naissance" value={member.dateOfBirth ? new Date(member.dateOfBirth).toLocaleDateString('fr-FR') : null} />
                  <Field label="Sexe" value={member.gender} />
                  <Field label="Matricule" value={member.cardNumber} />
                  <Field label="Numéro de carte" value={member.externalCardNumber} />
                  <Field label="Nationalité" value={member.nationality} />
                  <Field label="Groupe sanguin" value={member.bloodType} />
                  <Field label="Situation des parents" value={member.parentsSituation} />
                  <Field label="École" value={member.school} />
                  {(member.showProfession && (member.professionDomain || member.profession)) ? (
                    <>
                      <Field label="Domaine" value={member.professionDomain} />
                      <Field label="Profession" value={member.profession} />
                    </>
                  ) : (
                    <>
                      <Field label="Classe" value={member.classe} />
                      <Field label="Section" value={member.section} />
                    </>
                  )}
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact & famille — all household coordonnées pooled at top, then the parents (details only) + fratrie.
            Each section is its own titled Card for a consistent look. */}
        <TabsContent value="contact" className="space-y-6">
          <HouseholdContacts memberId={memberId} selfService />
          <MemberGuardians memberId={memberId} selfService hideContacts />
          <MemberSiblings memberId={memberId} canReport />
        </TabsContent>

        {/* A regular member can't edit their own assignments (leaders assign them); a leader
            (assignments.create) can manage them from here too. */}
        <TabsContent value="assignments"><MemberAssignments memberId={memberId} memberName={`${member.firstName} ${member.lastName}`} readOnly={!canManageOwnAssignments} selfPropose /></TabsContent>

        <TabsContent value="progression">
          <MemberProgression memberId={memberId} selfPropose />
        </TabsContent>

        {/* Médical + Infos complémentaires merged into one tab. The medical notes use the shared
            Modifier form (activeTab === 'medical'); the custom fields have their own inline editing. */}
        <TabsContent value="medical" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Informations médicales</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div className="space-y-2"><RequiredLabel>Allergies</RequiredLabel><textarea className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.allergies ?? ''} onChange={(e) => setForm(f => ({ ...f, allergies: e.target.value }))} /></div>
                  <div className="space-y-2"><RequiredLabel>Notes médicales</RequiredLabel><textarea className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.medicalNotes ?? ''} onChange={(e) => setForm(f => ({ ...f, medicalNotes: e.target.value }))} /></div>
                </div>
              ) : (
                <dl className="space-y-4">
                  <Field label="Allergies" value={member.allergies} />
                  <Field label="Notes médicales" value={member.medicalNotes} />
                </dl>
              )}
            </CardContent>
          </Card>
          <MemberCustomFields memberId={memberId} selfService />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{value || '—'}</dd></div>
}
