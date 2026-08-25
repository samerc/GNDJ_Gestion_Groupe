// Members master/detail screen (admin + CG + CU).
// Left: searchable, paginated member list (accent-insensitive search server-side) with an
// Actifs/Anciens (alumni) toggle and unit filter. Right: the selected member's full detail panel
// (tabbed Informations/Famille/Unités/Documents/Cotisations/Progression/Infos compl./Médical) with
// inline editing, photo, card PDF, and the SDL/GDL external-card-number editor.
// The split is drag-resizable on desktop. A create dialog returns auto-generated login credentials.
// Route param :id deep-links a member into the right panel.
import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { saveBlob } from '@/lib/download'
import { useState, useRef, useCallback, useMemo, type ReactNode, type ComponentType } from 'react'
import { useParams } from 'react-router'
import { useDebounce } from '@/hooks/use-debounce'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useMembers, useMember, useMemberUnitOptions, useCreateMember, useUpdateMember, useDeleteMember, useResetMemberPassword, useSetPrimaryContactEmail,
  useSendAccess,
  useAddPhone, useDeletePhone, useUpdatePhone, useAddEmail, useDeleteEmail, useUpdateEmail,
  useAddAddress, useDeleteAddress, useUpdateAddress,
  type MemberFormData, type MemberPhoneDto, type MemberEmailDto, type MemberAddressDto } from '@/services/member-service'
import { MemberPhoto } from '@/components/shared/member-photo'
import { useUnits } from '@/services/unit-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { CitySelect } from '@/components/shared/city-select'
import { useSettingArray, useSettingValue, matchSchool, useCities } from '@/services/settings-service'
import { MemberAssignments } from '@/components/members/member-assignments'
import { MemberGuardians } from '@/components/members/member-guardians'
import { MemberSiblings } from '@/components/members/member-siblings'
import { MemberDocuments } from '@/components/members/member-documents'
import { MemberCotisations } from '@/components/members/member-cotisations'
import { MemberProgression } from '@/components/members/member-progression'
import { MemberCustomFields } from '@/components/members/member-custom-fields'
// Data hooks reused (React Query dedupes by key with the tab components) to show item counts on the tabs.
import { generateMemberCard } from '@/services/report-service'
import { ExportDialog } from '@/components/shared/export-dialog'
import { GENDER_OPTIONS, BLOOD_TYPE_OPTIONS, NATIONALITY_OPTIONS, PHONE_TYPE_OPTIONS, PHONE_COUNTRY_CODES, EMAIL_TYPE_OPTIONS, ADDRESS_TYPE_OPTIONS, COUNTRY_OPTIONS } from '@/lib/options'
import { calendarScoutYear } from '@/hooks/use-scout-year'
import { useUnitAbsenceCounts } from '@/services/meeting-service'
import { cn, computeAge } from '@/lib/utils'
import { Plus, Search, GripVertical, ArrowUpDown, ArrowUp, ArrowDown, ArrowLeft, Phone, Mail, MapPin, Copy, X, CreditCard, FileSpreadsheet, User, GraduationCap, Contact, Cake, Flag, Droplet, Pencil, KeyRound, Save, Trash2, CheckCircle2, AlertTriangle, Send, CalendarCheck, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || '—'}</dd>
    </div>
  )
}


function Section({ icon: Icon, title, children }: { icon: ComponentType<{ className?: string }>; title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 text-primary/70" />{title}
      </h4>
      {children}
    </div>
  )
}

function Chip({ icon: Icon, children }: { icon?: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium shadow-2xs">
      {Icon && <Icon className="h-3.5 w-3.5 text-primary/70" />}{children}
    </span>
  )
}

// Dossier-compliance indicator for a roster row: green check when documents are complete AND the
// current-year cotisation is paid/exempt, else an amber warning whose tooltip says what's missing.
// Renders nothing for the alumni view / when compliance wasn't computed (docsComplete null).
function ComplianceDot({ docsComplete, cotisationOk }: { docsComplete?: boolean | null; cotisationOk?: boolean | null }) {
  if (docsComplete === null || docsComplete === undefined) return null
  const issues: string[] = []
  if (docsComplete === false) issues.push('Documents incomplets')
  if (cotisationOk === false) issues.push('Cotisation non payée') // null = not tracked → not an issue
  if (issues.length === 0)
    return <Tip content="Dossier complet"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></Tip>
  return <Tip content={issues.join(' · ')}><AlertTriangle className="h-4 w-4 text-amber-500" /></Tip>
}

// Subtle count badge shown after a tab label (hidden when zero). Module scope so its identity is stable.
function TabCount({ n }: { n: number }) {
  if (!n) return null
  return <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{n}</span>
}

// ─── Member detail panel ─────────────────
function MemberDetailPanel({ memberId, onDeleted }: { memberId: string; onDeleted: () => void }) {
  const { data: member, isLoading } = useMember(memberId)
  const updateMember = useUpdateMember()
  const deleteMember = useDeleteMember()
  const resetPassword = useResetMemberPassword()
  const sendAccess = useSendAccess()
  const setPrimary = useSetPrimaryContactEmail(memberId)
  const canEdit = useAuthStore((s) => s.hasPermission(PERMISSIONS.MEMBERS_EDIT))
  const canResetPassword = useAuthStore((s) => s.hasPermission(PERMISSIONS.MEMBERS_RESET_PASSWORD))
  const canDelete = useAuthStore((s) => s.hasPermission(PERMISSIONS.MEMBERS_DELETE))
  const canManageSiblings = useAuthStore((s) => s.hasPermission(PERMISSIONS.MAITRISE_MANAGE)) // CG/super-admin: link/unlink fratries

  // Tab item counts come from the member detail payload itself (folded into GET /members/{id}), so opening
  // a member is ONE request — no more firing five secondary list queries just to render these badges.
  const counts = member?.counts
  const familleCount = counts?.famille ?? 0
  const unitesCount = counts?.unites ?? 0
  const dossierCount = (counts?.documents ?? 0) + (counts?.cotisations ?? 0)
  const progressionCount = counts?.progression ?? 0

  const pinnedNationalities = useSettingArray('pinned_nationalities')
  const defaultCountryCode = useSettingValue('default_country_code')
  const defaultCountry = useSettingValue('default_country')
  const schools = useSettingArray('member.schools')
  const classes = useSettingArray('member.classes')
  const cities = useCities()

  // Contact mutations (phones/emails/addresses save immediately via their own dialogs).
  const addPhone = useAddPhone(memberId); const delPhone = useDeletePhone(memberId); const updPhone = useUpdatePhone(memberId)
  const addEmail = useAddEmail(memberId); const delEmail = useDeleteEmail(memberId); const updEmail = useUpdateEmail(memberId)
  const addAddress = useAddAddress(memberId); const delAddress = useDeleteAddress(memberId); const updAddress = useUpdateAddress(memberId)

  // Profil + Scolarité + Médical share one inline edit form (the header "Modifier" button).
  const [editing, setEditing] = useState(false)
  // Controlled tabs: the edit form only lives on Informations + Médical, so the "Modifier"/Save controls are
  // shown ONLY on those tabs (else a CU on Documents/Progression sees Save with no form and persists stale data).
  const [activeTab, setActiveTab] = useState('info')
  const isFormTab = activeTab === 'info' || activeTab === 'medical'
  const [form, setForm] = useState<MemberFormData>({ firstName: '', lastName: '' })
  const [error, setError] = useState('')

  // Reset password (one-time credentials).
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetCreds, setResetCreds] = useState<{ username: string; password: string; sentToEmail: string | null } | null>(null)

  // Delete member (soft-delete → Corbeille, restorable until the purge job runs).
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const handleDelete = async () => {
    try {
      await deleteMember.mutateAsync(memberId)
      toast.success('Membre supprimé — récupérable dans la Corbeille')
      setDeleteConfirmOpen(false)
      onDeleted()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  // Contact add/edit/delete dialog state.
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [deletingContact, setDeletingContact] = useState<{ type: 'phone' | 'email' | 'address'; id: string; label: string } | null>(null)
  const [phoneForm, setPhoneForm] = useState({ countryCode: '+961', number: '', type: 'Mobile', isPrimary: false, isEmergency: false })
  const [emailForm, setEmailForm] = useState({ address: '', type: 'Personnel', isPrimary: false, isEmergency: false })
  const [addressForm, setAddressForm] = useState({ type: 'Domicile', country: 'Liban', city: '', details: '', isPrimary: false })
  const [editingPhone, setEditingPhone] = useState<MemberPhoneDto | null>(null)
  const [editPhoneForm, setEditPhoneForm] = useState({ countryCode: '', number: '', type: '', isPrimary: false, isEmergency: false })
  const [editingEmail, setEditingEmail] = useState<MemberEmailDto | null>(null)
  const [editEmailForm, setEditEmailForm] = useState({ address: '', type: '', isPrimary: false, isEmergency: false })
  const [editingAddress, setEditingAddress] = useState<MemberAddressDto | null>(null)
  const [editAddressForm, setEditAddressForm] = useState({ type: '', country: '', city: '', details: '', isPrimary: false })

  if (isLoading) return <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>
  if (!member) return null

  const age = computeAge(member.dateOfBirth)

  const startEdit = () => {
    setForm({
      firstName: member.firstName, lastName: member.lastName,
      dateOfBirth: member.dateOfBirth ?? '', gender: member.gender ?? '',
      cardNumber: member.cardNumber ?? '', externalCardNumber: member.externalCardNumber ?? '',
      bloodType: member.bloodType ?? '', nationality: member.nationality ?? '',
      school: member.school ?? '', classe: member.classe ?? '', section: member.section ?? '',
      medicalNotes: member.medicalNotes ?? '', allergies: member.allergies ?? '', notes: member.notes ?? '',
    })
    setError(''); setEditing(true)
  }

  // UpdateMember is a full replace, so send every field (empty → null clears it).
  const handleSave = async () => {
    setError('')
    const missing: string[] = []
    if (!form.firstName?.trim()) missing.push('prénom')
    if (!form.lastName?.trim()) missing.push('nom')
    if (!form.dateOfBirth) missing.push('date de naissance')
    if (!form.gender) missing.push('genre')
    if (!form.nationality?.trim()) missing.push('nationalité')
    if (!form.school?.trim()) missing.push('école')
    if (!form.classe?.trim()) missing.push('classe')
    if (missing.length) { setError(`Champs requis manquants : ${missing.join(', ')}.`); return }
    try {
      await updateMember.mutateAsync({
        id: memberId, ...form,
        dateOfBirth: form.dateOfBirth || null, gender: form.gender || null,
        cardNumber: form.cardNumber || null, externalCardNumber: form.externalCardNumber || null,
        bloodType: form.bloodType || null, nationality: form.nationality || null,
        school: form.school || null, classe: form.classe || null, section: form.section || null,
        medicalNotes: form.medicalNotes || null, allergies: form.allergies || null, notes: form.notes || null,
      })
      toast.success('Membre modifié')
      setEditing(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleResetPassword = async () => {
    try {
      const creds = await resetPassword.mutateAsync(memberId)
      setResetCreds({ username: creds.username, password: creds.temporaryPassword, sentToEmail: creds.sentToEmail })
      toast.success(creds.sentToEmail ? `Mot de passe réinitialisé — email envoyé à ${creds.sentToEmail}` : 'Mot de passe réinitialisé')
    } catch (err) { toast.error(parseApiError(err)) }
    finally { setResetConfirmOpen(false) }
  }

  // Send (or resend) this member's activation email — their username + a link to set their own password.
  const handleResendAccess = async () => {
    try {
      const res = await sendAccess.mutateAsync({ memberIds: [memberId] })
      if (res.sent > 0) toast.success(`Accès envoyé à ${res.details[0]?.email ?? "l'email de contact"}`)
      else if (res.noEmail > 0) toast.error('Aucun email de contact sur la fiche')
      else if (res.noAccount > 0) toast.error("Ce membre n'a pas de compte utilisateur")
      else toast.error('Envoi impossible')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const setPrimaryEmail = async (email: string | null) => {
    try { await setPrimary.mutateAsync(email); toast.success('Courriel de contact principal mis à jour') }
    catch (err) { toast.error(parseApiError(err)) }
  }
  // Emails offered as the primary contact: the member's own + any guardian's (deduplicated).
  const contactEmailOptions = Array.from(new Set([...member.emails.map(e => e.address), ...member.guardianEmails]))

  // Contact handlers (immediate save).
  const submitAddPhone = async (e: React.FormEvent) => { e.preventDefault(); await addPhone.mutateAsync(phoneForm); setPhoneDialogOpen(false); setPhoneForm({ countryCode: defaultCountryCode ?? '+961', number: '', type: 'Mobile', isPrimary: false, isEmergency: false }) }
  const submitAddEmail = async (e: React.FormEvent) => { e.preventDefault(); await addEmail.mutateAsync(emailForm); setEmailDialogOpen(false); setEmailForm({ address: '', type: 'Personnel', isPrimary: false, isEmergency: false }) }
  const submitAddAddress = async (e: React.FormEvent) => { e.preventDefault(); await addAddress.mutateAsync({ ...addressForm, details: addressForm.details || null }); setAddressDialogOpen(false); setAddressForm({ type: 'Domicile', country: defaultCountry ?? 'Liban', city: '', details: '', isPrimary: false }) }
  const openEditPhone = (p: MemberPhoneDto) => { setEditPhoneForm({ countryCode: p.countryCode, number: p.number, type: p.type, isPrimary: p.isPrimary, isEmergency: p.isEmergency }); setEditingPhone(p) }
  const submitEditPhone = async (e: React.FormEvent) => { e.preventDefault(); if (!editingPhone) return; try { await updPhone.mutateAsync({ id: editingPhone.id, ...editPhoneForm }); toast.success('Téléphone modifié'); setEditingPhone(null) } catch (err) { toast.error(parseApiError(err)) } }
  const openEditEmail = (em: MemberEmailDto) => { setEditEmailForm({ address: em.address, type: em.type, isPrimary: em.isPrimary, isEmergency: em.isEmergency }); setEditingEmail(em) }
  const submitEditEmail = async (e: React.FormEvent) => { e.preventDefault(); if (!editingEmail) return; try { await updEmail.mutateAsync({ id: editingEmail.id, ...editEmailForm }); toast.success('Courriel modifié'); setEditingEmail(null) } catch (err) { toast.error(parseApiError(err)) } }
  const openEditAddress = (a: MemberAddressDto) => { setEditAddressForm({ type: a.type, country: a.country, city: a.city, details: a.details ?? '', isPrimary: a.isPrimary }); setEditingAddress(a) }
  const submitEditAddress = async (e: React.FormEvent) => { e.preventDefault(); if (!editingAddress) return; try { await updAddress.mutateAsync({ id: editingAddress.id, ...editAddressForm, details: editAddressForm.details || null }); toast.success('Adresse modifiée'); setEditingAddress(null) } catch (err) { toast.error(parseApiError(err)) } }
  const handleDeleteContact = async () => {
    if (!deletingContact) return
    if (deletingContact.type === 'phone') await delPhone.mutateAsync(deletingContact.id)
    else if (deletingContact.type === 'email') await delEmail.mutateAsync(deletingContact.id)
    else await delAddress.mutateAsync(deletingContact.id)
    setDeletingContact(null)
  }

  const downloadCard = async () => {
    try {
      const response = await generateMemberCard(memberId)
      saveBlob(response.data, `Carte_${member.firstName}_${member.lastName}.pdf`, 'application/pdf')
    } catch (err) { toast.error(await parseBlobError(err)) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header — always visible: identity, login username + reset, card PDF, edit toggle */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <MemberPhoto memberId={memberId} name={`${member.firstName} ${member.lastName}`} photoPath={member.photoPath} size={48} editable />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold">{member.firstName} {member.lastName}</h2>
            <p className="text-xs text-muted-foreground">
              {member.cardNumber && `N° ${member.cardNumber}`}
              {member.cardNumber && member.gender && ' — '}
              {member.gender}
              {member.dateOfBirth && ` — Né(e) le ${new Date(member.dateOfBirth).toLocaleDateString('fr-FR')}`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {member.username
                ? <>Identifiant : <span className="font-medium text-foreground">{member.username}</span></>
                : <span className="italic">Aucun compte utilisateur</span>}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {/* Member actions as a single LABELLED menu (was four hover-only, unlabelled icon buttons — invisible
                on touch and ambiguous). Reset-password is a top support task, so it deserves a readable label. */}
            {!editing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">Actions<ChevronDown className="ml-1 h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {canResetPassword && member.username && (
                    <DropdownMenuItem onClick={handleResendAccess} disabled={sendAccess.isPending}>
                      <Send className="mr-2 h-4 w-4" />Envoyer l'accès (identifiant + lien)
                    </DropdownMenuItem>
                  )}
                  {canResetPassword && member.username && (
                    <DropdownMenuItem onClick={() => setResetConfirmOpen(true)}>
                      <KeyRound className="mr-2 h-4 w-4" />Réinitialiser le mot de passe
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={downloadCard}>
                    <CreditCard className="mr-2 h-4 w-4" />Télécharger la carte de membre
                  </DropdownMenuItem>
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteConfirmOpen(true)} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />Supprimer le membre
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canEdit && isFormTab && (editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Annuler</Button>
                <Button size="sm" onClick={handleSave} disabled={updateMember.isPending}>
                  <Save className="mr-1 h-4 w-4" />{updateMember.isPending ? '…' : 'Enregistrer'}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={startEdit}><Pencil className="mr-1 h-4 w-4" />Modifier</Button>
            ))}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 shrink-0 justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="info">Informations</TabsTrigger>
          <TabsTrigger value="famille">Famille<TabCount n={familleCount} /></TabsTrigger>
          <TabsTrigger value="unites">Unités / Fonctions<TabCount n={unitesCount} /></TabsTrigger>
          <TabsTrigger value="dossier">Documents &amp; cotisations<TabCount n={dossierCount} /></TabsTrigger>
          <TabsTrigger value="progression">Progression<TabCount n={progressionCount} /></TabsTrigger>
          <TabsTrigger value="medical">Médical &amp; infos</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto p-4">
          <TabsContent value="info" className="mt-0 space-y-6">
            {error && editing && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            {/* Hero: portrait + quick facts (summary; reflects saved values) */}
            <div className="flex flex-col gap-4 rounded-xl border bg-gradient-to-br from-muted/50 to-transparent p-4 sm:flex-row sm:items-center">
              <MemberPhoto memberId={memberId} name={`${member.firstName} ${member.lastName}`} photoPath={member.photoPath} size={132} height={176} rounded="rounded-xl" editable className="shadow-sm ring-1 ring-border" />
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-xl font-bold leading-tight">{member.firstName} {member.lastName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {member.cardNumber && <span>Matricule {member.cardNumber}</span>}
                    {member.externalCardNumber && <span> · Carte {member.externalCardNumber}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {age != null && <Chip icon={Cake}>{age} ans</Chip>}
                  {member.gender && <Chip icon={User}>{member.gender}</Chip>}
                  {member.nationality && <Chip icon={Flag}>{member.nationality}</Chip>}
                  {member.bloodType && <Chip icon={Droplet}>{member.bloodType}</Chip>}
                  {member.absencesThisYear > 0 && (
                    <Tip content="Absences aux réunions cette année scoute">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        <CalendarCheck className="h-3.5 w-3.5" />{member.absencesThisYear} absence{member.absencesThisYear > 1 ? 's' : ''}
                      </span>
                    </Tip>
                  )}
                </div>
              </div>
            </div>

            <Section icon={User} title="Identité">
              {editing ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1.5"><RequiredLabel required>Prénom</RequiredLabel><Input value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                  <div className="space-y-1.5"><RequiredLabel required>Nom</RequiredLabel><Input value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value.toUpperCase() }))} /></div>
                  <div className="space-y-1.5"><RequiredLabel required>Date de naissance</RequiredLabel><Input type="date" value={form.dateOfBirth ?? ''} onChange={(e) => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} /></div>
                  <div className="space-y-1.5">
                    <RequiredLabel required>Sexe</RequiredLabel>
                    <Select value={form.gender ?? ''} onValueChange={(v) => setForm(f => ({ ...f, gender: v }))}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                      <SelectContent>{GENDER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <RequiredLabel required>Nationalité</RequiredLabel>
                    <SearchableSelect value={form.nationality ?? ''} onValueChange={(v) => setForm(f => ({ ...f, nationality: v }))} options={NATIONALITY_OPTIONS} pinnedValues={pinnedNationalities} searchPlaceholder="Rechercher une nationalité..." />
                  </div>
                  <div className="space-y-1.5"><RequiredLabel>Matricule</RequiredLabel><Input value={form.cardNumber ?? ''} onChange={(e) => setForm(f => ({ ...f, cardNumber: e.target.value }))} /></div>
                  <div className="space-y-1.5"><RequiredLabel>Numéro de carte (SDL/GDL)</RequiredLabel><Input value={form.externalCardNumber ?? ''} onChange={(e) => setForm(f => ({ ...f, externalCardNumber: e.target.value }))} placeholder="Optionnel" maxLength={50} /></div>
                </div>
              ) : (
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Field label="Prénom" value={member.firstName} />
                  <Field label="Nom" value={member.lastName} />
                  <Field label="Date de naissance" value={member.dateOfBirth ? `${new Date(member.dateOfBirth).toLocaleDateString('fr-FR')}${age != null ? ` (${age} ans)` : ''}` : null} />
                  <Field label="Sexe" value={member.gender} />
                  <Field label="Nationalité" value={member.nationality} />
                  <Field label="Matricule" value={member.cardNumber} />
                  <Field label="Numéro de carte (SDL/GDL)" value={member.externalCardNumber} />
                </div>
              )}
            </Section>

            <Section icon={GraduationCap} title="Scolarité">
              {editing ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1.5">
                    <RequiredLabel required>École</RequiredLabel>
                    {(() => {
                      const isOtherSchool = form.school ? !schools.includes(form.school) : false
                      return (
                        <>
                          <Select value={isOtherSchool ? '__other__' : (form.school || '')} onValueChange={(v) => { if (v === '__other__') setForm(f => ({ ...f, school: '' })); else setForm(f => ({ ...f, school: v })) }}>
                            <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                            <SelectContent>
                              {schools.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              <SelectItem value="__other__">Autre...</SelectItem>
                            </SelectContent>
                          </Select>
                          {isOtherSchool && <Input value={form.school || ''} onChange={(e) => setForm(f => ({ ...f, school: e.target.value }))} onBlur={(e) => setForm(f => ({ ...f, school: matchSchool(e.target.value, schools) }))} placeholder="Nom de l'école..." />}
                        </>
                      )
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    <RequiredLabel required>Classe</RequiredLabel>
                    <Select value={form.classe || ''} onValueChange={(v) => setForm(f => ({ ...f, classe: v }))}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                      <SelectContent>{classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><RequiredLabel>Section</RequiredLabel><Input value={form.section || ''} onChange={(e) => setForm(f => ({ ...f, section: e.target.value.slice(0, 5) }))} placeholder="Ex: SV, SE..." maxLength={5} /></div>
                </div>
              ) : (
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Field label="École" value={member.school} />
                  <Field label="Classe" value={member.classe} />
                  <Field label="Section" value={member.section} />
                </div>
              )}
            </Section>

            <Section icon={Contact} title="Coordonnées">
              {/* Primary contact email — recipient for member-facing mail (password reset). */}
              <div className="mb-4 rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium"><Mail className="h-3.5 w-3.5 text-muted-foreground" />Courriel de contact principal</p>
                    <p className="text-xs text-muted-foreground">Adresse utilisée pour les emails au membre (réinitialisation du mot de passe…).</p>
                  </div>
                  {canEdit && (
                    <Select value={member.primaryContactEmail ?? '__auto__'} onValueChange={(v) => setPrimaryEmail(v === '__auto__' ? null : v)} disabled={setPrimary.isPending}>
                      <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">Automatique (membre, sinon tuteur)</SelectItem>
                        {contactEmailOptions.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {contactEmailOptions.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-600">Aucune adresse email sur la fiche — ajoutez un courriel (membre ou tuteur) pour permettre l'envoi.</p>
                )}
              </div>
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h5 className="flex items-center gap-1.5 text-sm font-medium"><Phone className="h-3.5 w-3.5 text-muted-foreground" />Téléphones</h5>
                    {editing && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setPhoneForm(f => ({ ...f, countryCode: defaultCountryCode ?? '+961' })); setPhoneDialogOpen(true) }}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>}
                  </div>
                  {member.phones.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : (
                    <div className="space-y-1.5">{member.phones.map(p => (
                      <div key={p.id} className="flex items-center gap-1.5 text-sm">
                        <span className="flex-1">{p.countryCode} {p.number} <span className="text-muted-foreground">({p.type})</span>{p.isEmergency && <Badge variant="destructive" className="ml-1 text-[9px]">Urgence</Badge>}</span>
                        {editing && <><button className="text-muted-foreground hover:text-foreground" onClick={() => openEditPhone(p)}><Pencil className="h-3 w-3" /></button><button className="text-destructive/80 hover:text-destructive" onClick={() => setDeletingContact({ type: 'phone', id: p.id, label: `${p.countryCode} ${p.number}` })}><Trash2 className="h-3 w-3" /></button></>}
                      </div>
                    ))}</div>
                  )}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h5 className="flex items-center gap-1.5 text-sm font-medium"><Mail className="h-3.5 w-3.5 text-muted-foreground" />Courriels</h5>
                    {editing && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEmailDialogOpen(true)}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>}
                  </div>
                  {member.emails.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : (
                    <div className="space-y-1.5">{member.emails.map(e => (
                      <div key={e.id} className="flex items-center gap-1.5 text-sm">
                        <span className="flex-1 break-all">{e.address} <span className="text-muted-foreground">({e.type})</span></span>
                        {editing && <><button className="text-muted-foreground hover:text-foreground" onClick={() => openEditEmail(e)}><Pencil className="h-3 w-3" /></button><button className="text-destructive/80 hover:text-destructive" onClick={() => setDeletingContact({ type: 'email', id: e.id, label: e.address })}><Trash2 className="h-3 w-3" /></button></>}
                      </div>
                    ))}</div>
                  )}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h5 className="flex items-center gap-1.5 text-sm font-medium"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />Adresses</h5>
                    {editing && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setAddressForm(f => ({ ...f, country: defaultCountry ?? 'Liban' })); setAddressDialogOpen(true) }}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>}
                  </div>
                  {member.addresses.length === 0 ? <p className="text-sm text-muted-foreground">Aucune</p> : (
                    <div className="space-y-1.5">{member.addresses.map(a => (
                      <div key={a.id} className="flex items-center gap-1.5 text-sm">
                        <span className="flex-1">{a.city}, {a.country} <span className="text-muted-foreground">({a.type})</span>{a.details && <span className="block text-xs text-muted-foreground">{a.details}</span>}</span>
                        {editing && <><button className="text-muted-foreground hover:text-foreground" onClick={() => openEditAddress(a)}><Pencil className="h-3 w-3" /></button><button className="text-destructive/80 hover:text-destructive" onClick={() => setDeletingContact({ type: 'address', id: a.id, label: `${a.city}, ${a.country}` })}><Trash2 className="h-3 w-3" /></button></>}
                      </div>
                    ))}</div>
                  )}
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="famille" className="mt-0 space-y-4">
            <MemberGuardians memberId={memberId} />
            <MemberSiblings memberId={memberId} canManage={canManageSiblings} linkable />
          </TabsContent>

          <TabsContent value="unites" className="mt-0">
            <MemberAssignments memberId={memberId} memberName="" />
          </TabsContent>

          {/* Documents + Cotisations merged */}
          <TabsContent value="dossier" className="mt-0 space-y-8">
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet className="h-4 w-4 text-primary/70" />Documents</h4>
              <MemberDocuments memberId={memberId} />
            </div>
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CreditCard className="h-4 w-4 text-primary/70" />Cotisations</h4>
              <MemberCotisations memberId={memberId} />
            </div>
          </TabsContent>

          <TabsContent value="progression" className="mt-0">
            <MemberProgression memberId={memberId} />
          </TabsContent>

          {/* Médical + Infos complémentaires merged */}
          <TabsContent value="medical" className="mt-0 space-y-8">
            {error && editing && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <Section icon={Droplet} title="Médical">
              {editing ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <RequiredLabel>Groupe sanguin</RequiredLabel>
                      <Select value={form.bloodType ?? ''} onValueChange={(v) => setForm(f => ({ ...f, bloodType: v }))}>
                        <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                        <SelectContent>{BLOOD_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5"><RequiredLabel>Allergies</RequiredLabel><textarea className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.allergies ?? ''} onChange={(e) => setForm(f => ({ ...f, allergies: e.target.value }))} /></div>
                  <div className="space-y-1.5"><RequiredLabel>Notes médicales</RequiredLabel><textarea className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.medicalNotes ?? ''} onChange={(e) => setForm(f => ({ ...f, medicalNotes: e.target.value }))} /></div>
                  <div className="space-y-1.5"><RequiredLabel>Notes générales</RequiredLabel><textarea className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.notes ?? ''} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Groupe sanguin" value={member.bloodType} />
                  <Field label="Allergies" value={member.allergies} />
                  <Field label="Notes médicales" value={member.medicalNotes} />
                  <Field label="Notes générales" value={member.notes} />
                </div>
              )}
            </Section>
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Contact className="h-4 w-4 text-primary/70" />Infos complémentaires</h4>
              <MemberCustomFields memberId={memberId} />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Add phone / email / address dialogs */}
      <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un téléphone</DialogTitle></DialogHeader>
          <form onSubmit={submitAddPhone} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><RequiredLabel required>Indicatif</RequiredLabel><SearchableSelect value={phoneForm.countryCode} onValueChange={(v) => setPhoneForm(f => ({ ...f, countryCode: v }))} options={PHONE_COUNTRY_CODES} placeholder="Code pays" searchPlaceholder="Rechercher un indicatif..." /></div>
              <div className="col-span-2 space-y-2"><RequiredLabel required>Numéro</RequiredLabel><Input value={phoneForm.number} onChange={(e) => setPhoneForm(f => ({ ...f, number: e.target.value }))} required /></div>
            </div>
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={phoneForm.type} onValueChange={(v) => setPhoneForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PHONE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={phoneForm.isPrimary} onChange={(e) => setPhoneForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={phoneForm.isEmergency} onChange={(e) => setPhoneForm(f => ({ ...f, isEmergency: e.target.checked }))} />Urgence</label></div>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setPhoneDialogOpen(false)}>Annuler</Button><Button type="submit" disabled={addPhone.isPending}>{addPhone.isPending ? 'Ajout...' : 'Ajouter'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un courriel</DialogTitle></DialogHeader>
          <form onSubmit={submitAddEmail} className="space-y-4">
            <div className="space-y-2"><RequiredLabel required>Adresse courriel</RequiredLabel><Input type="email" value={emailForm.address} onChange={(e) => setEmailForm(f => ({ ...f, address: e.target.value }))} required /></div>
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={emailForm.type} onValueChange={(v) => setEmailForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EMAIL_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailForm.isPrimary} onChange={(e) => setEmailForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailForm.isEmergency} onChange={(e) => setEmailForm(f => ({ ...f, isEmergency: e.target.checked }))} />Urgence</label></div>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setEmailDialogOpen(false)}>Annuler</Button><Button type="submit" disabled={addEmail.isPending}>{addEmail.isPending ? 'Ajout...' : 'Ajouter'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter une adresse</DialogTitle></DialogHeader>
          <form onSubmit={submitAddAddress} className="space-y-4">
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={addressForm.type} onValueChange={(v) => setAddressForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ADDRESS_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><RequiredLabel required>Pays</RequiredLabel><Select value={addressForm.country} onValueChange={(v) => setAddressForm(f => ({ ...f, country: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COUNTRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><RequiredLabel required>Ville</RequiredLabel><CitySelect value={addressForm.city} onChange={(city) => setAddressForm(f => ({ ...f, city }))} cities={cities} /></div></div>
            <div className="space-y-2"><RequiredLabel>Détails</RequiredLabel><Input value={addressForm.details} onChange={(e) => setAddressForm(f => ({ ...f, details: e.target.value }))} placeholder="Rue, immeuble, appartement..." /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addressForm.isPrimary} onChange={(e) => setAddressForm(f => ({ ...f, isPrimary: e.target.checked }))} />Adresse principale</label>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setAddressDialogOpen(false)}>Annuler</Button><Button type="submit" disabled={addAddress.isPending}>{addAddress.isPending ? 'Ajout...' : 'Ajouter'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit contact dialogs */}
      <Dialog open={!!editingPhone} onOpenChange={() => setEditingPhone(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le téléphone</DialogTitle></DialogHeader>
          <form onSubmit={submitEditPhone} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><RequiredLabel required>Indicatif</RequiredLabel><SearchableSelect value={editPhoneForm.countryCode} onValueChange={(v) => setEditPhoneForm(f => ({ ...f, countryCode: v }))} options={PHONE_COUNTRY_CODES} placeholder="Code pays" searchPlaceholder="Rechercher un indicatif..." /></div>
              <div className="col-span-2 space-y-2"><RequiredLabel required>Numéro</RequiredLabel><Input value={editPhoneForm.number} onChange={(e) => setEditPhoneForm(f => ({ ...f, number: e.target.value }))} required /></div>
            </div>
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={editPhoneForm.type} onValueChange={(v) => setEditPhoneForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PHONE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editPhoneForm.isPrimary} onChange={(e) => setEditPhoneForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editPhoneForm.isEmergency} onChange={(e) => setEditPhoneForm(f => ({ ...f, isEmergency: e.target.checked }))} />Urgence</label></div>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setEditingPhone(null)}>Annuler</Button><Button type="submit" disabled={updPhone.isPending}>Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingEmail} onOpenChange={() => setEditingEmail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le courriel</DialogTitle></DialogHeader>
          <form onSubmit={submitEditEmail} className="space-y-4">
            <div className="space-y-2"><RequiredLabel required>Adresse</RequiredLabel><Input type="email" value={editEmailForm.address} onChange={(e) => setEditEmailForm(f => ({ ...f, address: e.target.value }))} required /></div>
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={editEmailForm.type} onValueChange={(v) => setEditEmailForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EMAIL_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editEmailForm.isPrimary} onChange={(e) => setEditEmailForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editEmailForm.isEmergency} onChange={(e) => setEditEmailForm(f => ({ ...f, isEmergency: e.target.checked }))} />Urgence</label></div>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setEditingEmail(null)}>Annuler</Button><Button type="submit" disabled={updEmail.isPending}>Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editingAddress} onOpenChange={() => setEditingAddress(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'adresse</DialogTitle></DialogHeader>
          <form onSubmit={submitEditAddress} className="space-y-4">
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={editAddressForm.type} onValueChange={(v) => setEditAddressForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ADDRESS_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><RequiredLabel required>Pays</RequiredLabel><Select value={editAddressForm.country} onValueChange={(v) => setEditAddressForm(f => ({ ...f, country: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COUNTRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><RequiredLabel required>Ville</RequiredLabel><CitySelect value={editAddressForm.city} onChange={(city) => setEditAddressForm(f => ({ ...f, city }))} cities={cities} /></div></div>
            <div className="space-y-2"><RequiredLabel>Détails</RequiredLabel><Input value={editAddressForm.details} onChange={(e) => setEditAddressForm(f => ({ ...f, details: e.target.value }))} placeholder="Rue, immeuble..." /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editAddressForm.isPrimary} onChange={(e) => setEditAddressForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setEditingAddress(null)}>Annuler</Button><Button type="submit" disabled={updAddress.isPending}>Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deletingContact} onOpenChange={() => setDeletingContact(null)} title="Supprimer" description={`Êtes-vous sûr de vouloir supprimer « ${deletingContact?.label} » ?`} confirmLabel="Supprimer" variant="destructive" onConfirm={handleDeleteContact} />

      {/* Delete member (soft-delete → Corbeille) */}
      <ConfirmDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen} title="Supprimer le membre"
        description={`${member.firstName} ${member.lastName} sera déplacé(e) vers la Corbeille (son compte est désactivé). Vous pourrez le/la restaurer jusqu'à sa suppression définitive automatique. Continuer ?`}
        confirmLabel="Supprimer" variant="destructive" loading={deleteMember.isPending} onConfirm={handleDelete} />

      {/* Reset password */}
      <ConfirmDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen} title="Réinitialiser le mot de passe"
        description={`Un nouveau mot de passe temporaire sera généré pour ${member.firstName} ${member.lastName}. Les sessions actives seront déconnectées. Continuer ?`}
        confirmLabel="Réinitialiser" loading={resetPassword.isPending} onConfirm={handleResetPassword} />
      <Dialog open={!!resetCreds} onOpenChange={() => setResetCreds(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mot de passe réinitialisé</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {resetCreds?.sentToEmail
              ? <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">Un email avec le mot de passe temporaire a été envoyé à <strong>{resetCreds.sentToEmail}</strong>. Le membre devra le changer à la première connexion.</div>
              : <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">Aucune adresse email sur la fiche : communiquez ces informations manuellement au membre.</div>}
            <p className="text-sm text-muted-foreground">Communiquez ces informations au membre. Le mot de passe ne sera plus affiché.</p>
            <div className="rounded-md bg-muted p-4 space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Nom d'utilisateur :</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-bold">{resetCreds?.username}</code>
                  <Button variant="ghost" size="sm" aria-label="Copier le nom d'utilisateur" title="Copier" onClick={() => { navigator.clipboard.writeText(resetCreds?.username ?? ''); toast.success('Copié !') }}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Nouveau mot de passe :</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-bold">{resetCreds?.password}</code>
                  <Button variant="ghost" size="sm" aria-label="Copier le mot de passe" title="Copier" onClick={() => { navigator.clipboard.writeText(resetCreds?.password ?? ''); toast.success('Copié !') }}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setResetCreds(null)}>Fermer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Drag handle ─────────────────────────
// Resizes the master/detail split: tracks mouse delta on document (not the element) so the
// drag keeps working if the pointer leaves the thin handle; restores cursor/select on mouseup.
function DragHandle({ onDrag }: { onDrag: (deltaX: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onDrag(ev.clientX - lastX.current)
      lastX.current = ev.clientX
    }
    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [onDrag])

  return (
    <div className="w-2 shrink-0 cursor-col-resize flex items-center justify-center bg-border/50 hover:bg-border transition-colors" onMouseDown={onMouseDown}>
      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
    </div>
  )
}

// ─── Sort header helper ──────────────────
function SortHeader({ label, field, current, dir, onSort }: { label: string; field: string; current: string; dir: string; onSort: (f: string) => void }) {
  const active = current === field
  return (
    <button className="flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors" onClick={() => onSort(field)}>
      {label}
      {active ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
    </button>
  )
}

// ─── Main page ───────────────────────────
export default function MembersPage() {
  const { id: routeMemberId } = useParams<{ id: string }>()
  const canCreate = useAuthStore((s) => s.hasPermission(PERMISSIONS.MEMBERS_CREATE)) // CG / super-admin only
  const pinnedNationalities = useSettingArray('pinned_nationalities')
  const schools = useSettingArray('member.schools')
  const defaultSchool = useSettingValue('member.default_school')
  const classes = useSettingArray('member.classes')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  const [unitFilter, setUnitFilter] = useState<string>('all')
  const [showAlumni, setShowAlumni] = useState(false)
  const [sortBy, setSortBy] = useState('lastname')
  const [sortDir, setSortDir] = useState('asc')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(routeMemberId ?? null)
  // If the URL /members/:id changes while this page stays mounted (a deep link / notification to another
  // member), follow it. Render-phase adjust (React's "reset state when a prop changes" pattern), no effect.
  const [prevRouteMemberId, setPrevRouteMemberId] = useState(routeMemberId)
  if (routeMemberId && routeMemberId !== prevRouteMemberId) {
    setPrevRouteMemberId(routeMemberId)
    setSelectedMemberId(routeMemberId)
  }
  const [leftWidth, setLeftWidth] = useState(340)

  // Export dialog
  const [exportOpen, setExportOpen] = useState(false)

  // Create dialog
  const [formOpen, setFormOpen] = useState(false)
  const [credentialsDialog, setCredentialsDialog] = useState<{ username: string; password: string; memberId: string } | null>(null)
  const [form, setForm] = useState<MemberFormData>({ firstName: '', lastName: '' })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const handleDrag = useCallback((deltaX: number) => {
    setLeftWidth(w => Math.max(300, Math.min(600, w + deltaX)))
  }, [])

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  // unitFilter is a single Select holding these kinds of value: 'all', 'maitrises' (all leaders), 'none'
  // (no unit), or a unit id.
  const isSpecialFilter = unitFilter === 'all' || unitFilter === 'none' || unitFilter === 'maitrises'
  const unitId = isSpecialFilter ? undefined : unitFilter
  const noUnit = unitFilter === 'none' ? true : undefined
  const maitrise = unitFilter === 'maitrises' ? true : undefined

  // Units shown in the filter depend on the view: only units that HAVE members in Actifs vs Anciens (so an
  // empty unit is hidden under Actifs but appears under Anciens if it still has former members). Re-fetched
  // when the toggle flips. `units` (all active units) is kept for the create form + resolving the selected name.
  const { data: unitOptions } = useMemberUnitOptions(showAlumni)
  const { data: units } = useUnits({ pageSize: 100 })

  // If the selected unit vanished from the options for the current view (e.g. it's empty under Actifs), fall
  // back to "Toutes les unités" so the list isn't stuck on a hidden unit. Render-phase reset (same idiom as the
  // route-member sync above); only fires while a real-but-missing unit is selected, so it can't loop.
  if (unitOptions && !isSpecialFilter && !unitOptions.some(u => u.id === unitFilter)) {
    setUnitFilter('all')
    setPage(1)
  }

  const { data, isLoading } = useMembers({
    search: debouncedSearch || undefined,
    unitId, noUnit, maitrise,
    alumni: showAlumni || undefined,
    sortBy, sortDir,
    page, pageSize: 50,
  })

  const createMutation = useCreateMember()

  // Absence counts for the selected unit (active view only, running calendar scout year) → a small badge per row.
  const { data: absenceCountsRaw } = useUnitAbsenceCounts(unitId, calendarScoutYear(), !!unitId && !showAlumni)
  const absenceCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of absenceCountsRaw ?? []) m.set(a.memberId, a.count)
    return m
  }, [absenceCountsRaw])

  const openCreate = () => {
    setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: '', bloodType: '', nationality: '', school: defaultSchool ?? '', classe: '', section: '', externalCardNumber: '', fatherName: '', motherName: '', motherMaidenName: '', unitId: '' })
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ firstName: !form.firstName, lastName: !form.lastName })) return
    try {
      const payload = { ...form, dateOfBirth: form.dateOfBirth || null, gender: form.gender || null, bloodType: form.bloodType || null, nationality: form.nationality || null, school: form.school || null, classe: form.classe || null, section: form.section || null, fatherName: form.fatherName || null, motherName: form.motherName || null, motherMaidenName: form.motherMaidenName || null, unitId: form.unitId || null }
      const result = await createMutation.mutateAsync(payload)
      toast.success('Membre créé')
      setFormOpen(false)
      setCredentialsDialog({ username: result.username, password: result.temporaryPassword, memberId: result.memberId })
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Top bar */}
      <div className="shrink-0 space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Membres</h1>
          <div className="flex items-center gap-2">
            {/* Span wrapper so the tooltip still fires when the button is disabled (Radix skips disabled triggers). */}
            <Tip content={isSpecialFilter ? 'Sélectionnez une unité pour exporter' : "Exporter l'unité en Excel ou CSV"}>
              <span className="inline-flex">
                <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} disabled={isSpecialFilter}>
                  <FileSpreadsheet className="mr-1 h-4 w-4" />
                  Exporter
                </Button>
              </span>
            </Tip>
            {canCreate && <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouveau membre</Button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[10rem] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher par nom, prénom ou carte..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-8 pr-8 h-8 text-sm" />
            {search && (
              <Tip content="Effacer la recherche">
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setSearch(''); setPage(1) }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </Tip>
            )}
          </div>
          <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v); setPage(1) }}>
            <SelectTrigger className="w-52 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les unités</SelectItem>
              <SelectItem value="maitrises">Maîtrises</SelectItem>
              {/* Only units that have members in the current view (Actifs / Anciens) — empty units are hidden. */}
              {unitOptions?.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.count})</SelectItem>)}
              {/* Export is enabled only for a concrete unit (not 'all'/'maitrises'/'none') — unit-scoped report */}
              <SelectItem value="none">Sans unité</SelectItem>
            </SelectContent>
          </Select>
          {/* Actifs / Anciens toggle */}
          <div className="flex h-8 shrink-0 items-center rounded-md border p-0.5 text-xs">
            <button
              type="button"
              className={cn('h-full rounded px-2.5 font-medium transition-colors', !showAlumni ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setShowAlumni(false); setPage(1) }}
            >
              Actifs
            </button>
            <button
              type="button"
              className={cn('h-full rounded px-2.5 font-medium transition-colors', showAlumni ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setShowAlumni(true); setPage(1) }}
            >
              Anciens
            </button>
          </div>
          {data && <span className="flex items-center text-xs text-muted-foreground">{data.totalCount} membre{data.totalCount > 1 ? 's' : ''}</span>}
        </div>
      </div>

      {/* 2-column layout — desktop: side-by-side split; mobile: master/detail (list OR detail, one at a time) */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 rounded-lg border overflow-hidden">
        {/* Left: member list — full width/height on mobile, fixed-width pane on desktop.
            max-md:!w-full overrides the inline pixel width below md; hidden on mobile once a member is picked. */}
        <div
          className={cn(
            'flex flex-col flex-1 md:flex-none md:shrink-0 overflow-hidden border-b md:border-b-0 max-md:!w-full',
            selectedMemberId && 'max-md:hidden'
          )}
          style={{ width: leftWidth }}
        >
          {/* Sortable header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 text-muted-foreground shrink-0">
            <div className="w-8" />
            <div className="flex-1 min-w-0">
              <SortHeader label="Nom" field="lastname" current={sortBy} dir={sortDir} onSort={handleSort} />
            </div>
            <div className="w-12 shrink-0 text-xs">Unité</div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto bg-muted/20">
            {isLoading ? <div className="flex items-center justify-center h-full"><LoadingSpinner /></div> :
             !data || data.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                {debouncedSearch ? <Search className="h-8 w-8 opacity-40" /> : <User className="h-8 w-8 opacity-40" />}
                <p className="text-sm">{debouncedSearch ? `Aucun résultat pour « ${debouncedSearch} »` : 'Aucun membre trouvé'}</p>
              </div>
            ) : (
              <>
                {data.items.map(m => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-border/40 transition-colors',
                      selectedMemberId === m.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/60'
                    )}
                    onClick={() => setSelectedMemberId(m.id)}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                      {m.firstName[0]}{m.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.lastName} {m.firstName}</p>
                      {m.dateOfBirth && <p className="text-[11px] text-muted-foreground">{new Date(m.dateOfBirth).toLocaleDateString('fr-FR')}</p>}
                    </div>
                    {absenceCounts.get(m.id) ? (
                      <Tip content="Absences aux réunions cette année">
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          <CalendarCheck className="h-3 w-3" />{absenceCounts.get(m.id)}
                        </span>
                      </Tip>
                    ) : null}
                    <div className="shrink-0"><ComplianceDot docsComplete={m.docsComplete} cotisationOk={m.cotisationOk} /></div>
                    <div className="w-12 shrink-0 text-[11px] text-muted-foreground text-center">{m.unitName ?? '—'}</div>
                  </div>
                ))}
                {/* Pagination */}
                {data.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 p-2 border-t bg-muted/30">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!data.hasPreviousPage} onClick={() => setPage(p => p - 1)}>Préc.</Button>
                    <span className="text-xs text-muted-foreground">{data.page}/{data.totalPages}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!data.hasNextPage} onClick={() => setPage(p => p + 1)}>Suiv.</Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Drag handle: desktop only */}
        <div className="hidden md:flex">
          <DragHandle onDrag={handleDrag} />
        </div>

        {/* Right: member detail — full screen on mobile (with a Retour button); hidden on mobile when nothing is selected. */}
        <div className={cn('flex flex-1 min-w-0 flex-col overflow-hidden bg-background', !selectedMemberId && 'max-md:hidden')}>
          {selectedMemberId ? (
            <>
              {/* Mobile-only: back to the list */}
              <button
                type="button"
                onClick={() => setSelectedMemberId(null)}
                className="flex shrink-0 items-center gap-1 border-b px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground md:hidden"
              >
                <ArrowLeft className="h-4 w-4" /> Retour à la liste
              </button>
              <div className="min-h-0 flex-1 overflow-hidden">
                <MemberDetailPanel key={selectedMemberId} memberId={selectedMemberId} onDeleted={() => setSelectedMemberId(null)} />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Sélectionnez un membre pour afficher sa fiche.
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nouveau membre</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <FormFieldErrors show={hasErrors} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel htmlFor="firstName" required>Prénom</RequiredLabel>
                <Input id="firstName" className={fieldClass('firstName')} value={form.firstName} onChange={(e) => { setForm(f => ({ ...f, firstName: e.target.value })); clearField('firstName') }} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="lastName" required>Nom</RequiredLabel>
                <Input id="lastName" className={fieldClass('lastName')} value={form.lastName} onChange={(e) => { setForm(f => ({ ...f, lastName: e.target.value.toUpperCase() })); clearField('lastName') }} required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel htmlFor="dateOfBirth" required>Date de naissance</RequiredLabel>
                <Input id="dateOfBirth" type="date" value={form.dateOfBirth ?? ''} onChange={(e) => setForm(f => ({ ...f, dateOfBirth: e.target.value || null }))} />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Sexe</RequiredLabel>
                <Select value={form.gender ?? ''} onValueChange={(v) => setForm(f => ({ ...f, gender: v === '__clear__' ? '' : v || null }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__">-- Aucun --</SelectItem>
                    {GENDER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel required>Nationalité</RequiredLabel>
                <div className="flex items-center gap-1">
                  <div className="flex-1">
                    <SearchableSelect value={form.nationality ?? ''} onValueChange={(v) => setForm(f => ({ ...f, nationality: v || null }))} options={NATIONALITY_OPTIONS} pinnedValues={pinnedNationalities} searchPlaceholder="Rechercher une nationalité..." />
                  </div>
                  {form.nationality && (
                    <Tip content="Effacer la nationalité">
                      <Button variant="ghost" size="icon" type="button" className="h-7 w-7 shrink-0" onClick={() => setForm(f => ({ ...f, nationality: '' }))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </Tip>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <RequiredLabel>Groupe sanguin</RequiredLabel>
                <Select value={form.bloodType ?? ''} onValueChange={(v) => setForm(f => ({ ...f, bloodType: v === '__clear__' ? '' : v || null }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__">-- Aucun --</SelectItem>
                    {BLOOD_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel required>École</RequiredLabel>
                {(() => {
                  const isOtherSchool = form.school ? !schools.includes(form.school) : false
                  return (
                    <>
                      <Select
                        value={isOtherSchool ? '__other__' : (form.school || '')}
                        onValueChange={(v) => {
                          if (v === '__other__') setForm(f => ({ ...f, school: '' }))
                          else setForm(f => ({ ...f, school: v }))
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                        <SelectContent>
                          {schools.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          <SelectItem value="__other__">Autre...</SelectItem>
                        </SelectContent>
                      </Select>
                      {isOtherSchool && (
                        <Input value={form.school || ''} onChange={(e) => setForm(f => ({ ...f, school: e.target.value }))} onBlur={(e) => setForm(f => ({ ...f, school: matchSchool(e.target.value, schools) }))} placeholder="Nom de l'école..." />
                      )}
                    </>
                  )
                })()}
              </div>
              <div className="space-y-2">
                <RequiredLabel>Classe</RequiredLabel>
                <Select value={form.classe || ''} onValueChange={(v) => setForm(f => ({ ...f, classe: v === '__clear__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__">-- Aucune --</SelectItem>
                    {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel>Section</RequiredLabel>
                <Input value={form.section || ''} onChange={(e) => setForm(f => ({ ...f, section: e.target.value.slice(0, 5) }))} placeholder="Ex: SV, SE..." maxLength={5} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Numéro de carte (SDL/GDL)</RequiredLabel>
                <Input value={form.externalCardNumber || ''} onChange={(e) => setForm(f => ({ ...f, externalCardNumber: e.target.value }))} placeholder="Optionnel" maxLength={50} />
              </div>
            </div>
            {/* Optional unit placement: creates an active assignment (no team, default function) so the member
                shows on the CU's roster immediately. Options are the units the current user can access. */}
            <div className="space-y-2">
              <RequiredLabel>Unité</RequiredLabel>
              <Select value={form.unitId || ''} onValueChange={(v) => setForm(f => ({ ...f, unitId: v === '__clear__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Aucune (à affecter plus tard)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">Aucune (à affecter plus tard)</SelectItem>
                  {units?.items.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Le membre sera placé dans l'unité (sans équipe, fonction par défaut) et visible par le chef d'unité.</p>
            </div>
            {/* Parents (optional): creates linked Père/Mère guardians. The father's initial also
                disambiguates a duplicate username. */}
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parents (facultatif)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <RequiredLabel>Nom du père</RequiredLabel>
                  <Input value={form.fatherName || ''} onChange={(e) => setForm(f => ({ ...f, fatherName: e.target.value }))} placeholder="Prénom du père" maxLength={100} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Nom de la mère</RequiredLabel>
                  <Input value={form.motherName || ''} onChange={(e) => setForm(f => ({ ...f, motherName: e.target.value }))} placeholder="Prénom de la mère" maxLength={100} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <RequiredLabel>Nom de jeune fille (mère)</RequiredLabel>
                  <Input value={form.motherMaidenName || ''} onChange={(e) => setForm(f => ({ ...f, motherMaidenName: e.target.value.toUpperCase() }))} placeholder="Nom de famille de la mère" maxLength={100} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Création...' : 'Créer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Export dialog */}
      {!isSpecialFilter && (
        <ExportDialog
          unitId={unitFilter}
          unitName={units?.items.find(u => u.id === unitFilter)?.name ?? ''}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      )}

      {/* Credentials dialog — one-time view of the new member's login; closing selects them in the detail panel */}
      <Dialog open={!!credentialsDialog} onOpenChange={() => { if (credentialsDialog) setSelectedMemberId(credentialsDialog.memberId); setCredentialsDialog(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Compte créé avec succès</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Un compte utilisateur a été créé automatiquement. Notez ces informations.</p>
            <div className="rounded-md bg-muted p-4 space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Nom d'utilisateur :</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-bold">{credentialsDialog?.username}</code>
                  <Tip content="Copier le nom d'utilisateur">
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(credentialsDialog?.username ?? ''); toast.success('Copié !') }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Mot de passe :</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-bold">{credentialsDialog?.password}</code>
                  <Tip content="Copier le mot de passe">
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(credentialsDialog?.password ?? ''); toast.success('Copié !') }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { if (credentialsDialog) setSelectedMemberId(credentialsDialog.memberId); setCredentialsDialog(null) }}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
