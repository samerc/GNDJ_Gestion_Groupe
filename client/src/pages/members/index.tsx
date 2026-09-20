// Members master/detail screen (admin + CG + CU).
// Left: searchable, paginated member list (accent-insensitive search server-side) with an
// Actifs/Anciens (alumni) toggle and unit filter. Right: the selected member's full detail panel
// (tabbed Informations/Famille/Unités/Documents/Cotisations/Progression/Infos compl./Médical) with
// inline editing, photo, card PDF, and the SDL/GDL external-card-number editor.
// The split is drag-resizable on desktop. A create dialog returns auto-generated login credentials.
// Route param :id deep-links a member into the right panel.
import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { saveBlob } from '@/lib/download'
import { useState, useRef, useCallback, useMemo, useEffect, type ReactNode, type ComponentType } from 'react'
import { useParams } from 'react-router'
import { useImpersonationStore } from '@/stores/impersonation-store'
import { useDebounce } from '@/hooks/use-debounce'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useFormValidation } from '@/hooks/use-form-validation'
import { useMembers, useMember, useMemberUnitOptions, useCreateMember, useUpdateMember, useDeleteMember, useRestoreMember, useResetMemberPassword, useSetMemberLoginActive,
  useSendAccess, useUpdateMemberUsername, type MemberFormData } from '@/services/member-service'
import { MemberPhoto } from '@/components/shared/member-photo'
import { useUnits } from '@/services/unit-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { Input } from '@/components/ui/input'
import { CopyButton } from '@/components/shared/copy-button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { useSettingArray, useSettingValue } from '@/services/settings-service'
import { SchoolSelect } from '@/components/shared/school-select'
import { MemberAssignments } from '@/components/members/member-assignments'
import { MemberGuardians } from '@/components/members/member-guardians'
import { MemberSiblings } from '@/components/members/member-siblings'
import { HouseholdContacts } from '@/components/members/household-contacts'
import { MemberDocuments } from '@/components/members/member-documents'
import { MemberCotisations } from '@/components/members/member-cotisations'
import { MemberProgression } from '@/components/members/member-progression'
import { MemberCustomFields } from '@/components/members/member-custom-fields'
import { MemberAuditLog } from '@/components/members/member-audit-log'
// Data hooks reused (React Query dedupes by key with the tab components) to show item counts on the tabs.
import { generateMemberCard } from '@/services/report-service'
import { ExportDialog } from '@/components/shared/export-dialog'
import { MemberImportDialog } from '@/components/admin/member-import-dialog'
import { GENDER_OPTIONS, BLOOD_TYPE_OPTIONS, NATIONALITY_OPTIONS, PARENTS_SITUATION_OPTIONS } from '@/lib/options'
import { calendarScoutYear } from '@/hooks/use-scout-year'
import { useUnitAbsenceCounts, useMemberAbsencesByYear, type MemberAbsenceYear } from '@/services/meeting-service'
import { cn, computeAge } from '@/lib/utils'
import { Plus, Search, GripVertical, ArrowUpDown, ArrowUp, ArrowDown, ArrowLeft, Copy, X, CreditCard, FileSpreadsheet, User, GraduationCap, Contact, Droplet, Pencil, KeyRound, Save, Trash2, CheckCircle2, AlertTriangle, Send, CalendarCheck, ChevronDown, SlidersHorizontal, ShieldCheck, Star, Upload, Eye, Lock, Unlock, Smartphone } from 'lucide-react'
import { pushRecentMember, isFavoriteMember, toggleFavoriteMember } from '@/lib/recent-members'
import { DelegationDialog } from './delegation-dialog'
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


// Youth (school-age) branches: a member here fills Classe/Section, never a profession. Used to hide the
// "En activité" option in the create dialog (the panel/Ma fiche use the server-computed member.showProfession).
const YOUTH_BRANCH_CODES = ['MEU', 'RON', 'COM', 'TRO']

// Family-name A–Z quick index for the members list.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

// One ready-to-send message with both credentials (for pasting into WhatsApp / a chat to the member).
function credentialsMessage(username: string, password: string): string {
  return `Identifiant : ${username}\nMot de passe temporaire : ${password}\nÀ changer à la première connexion.`
}

// Réunion type labels + a dd/MM/yyyy (range) date formatter for the absence-details popup.
const MEETING_TYPE_LABELS: Record<string, string> = { Reunion: 'Réunion', Sortie: 'Sortie', Camp: 'Camp' }
function frDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
function formatAbsenceDate(date: string, endDate: string | null): string {
  return endDate && endDate !== date ? `${frDate(date)} → ${frDate(endDate)}` : frDate(date)
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
  // Record this member as recently-viewed (localStorage) for quick jump-back in the Ctrl-K palette.
  useEffect(() => {
    if (member) pushRecentMember({ id: memberId, name: `${member.firstName} ${member.lastName}` })
  }, [member, memberId])
  // Favorite toggle (localStorage, per-device) — star in the header.
  const [fav, setFav] = useState(() => isFavoriteMember(memberId))
  const updateMember = useUpdateMember()
  const deleteMember = useDeleteMember()
  const restoreMember = useRestoreMember()
  const resetPassword = useResetMemberPassword()
  const setLoginActive = useSetMemberLoginActive()
  const updateUsername = useUpdateMemberUsername(memberId)
  const sendAccess = useSendAccess()
  const canEdit = useAuthStore((s) => s.hasPermission(PERMISSIONS.MEMBERS_EDIT))
  const canResetPassword = useAuthStore((s) => s.hasPermission(PERMISSIONS.MEMBERS_RESET_PASSWORD))
  const canDelete = useAuthStore((s) => s.hasPermission(PERMISSIONS.MEMBERS_DELETE))
  const canDelegate = useAuthStore((s) => s.hasPermission(PERMISSIONS.ROLES_MANAGE_GROUP)) // CG/super-admin: accès délégué
  // Member-card generation is a group-wide toggle (Paramètres → Rapports). Off => hide the download action.
  const cardsEnabled = useSettingValue('reports.cards_enabled') !== 'false'
  const canManageSiblings = useAuthStore((s) => s.hasPermission(PERMISSIONS.MAITRISE_MANAGE)) // CG/super-admin: link/unlink fratries
  const canViewAudit = useAuthStore((s) => s.hasPermission(PERMISSIONS.AUDIT_VIEW)) // CG/super-admin: the member "Journal" tab
  // "Voir comme" (impersonation): super-admin OR Chef de Groupe (maitrise.manage). Hidden for yourself and for a
  // super-admin target (member.isSuperAdmin is only ever populated true for a super-admin viewer; the server
  // refuses a super-admin target regardless).
  const canImpersonate = useAuthStore((s) => s.hasPermission(PERMISSIONS.MAITRISE_MANAGE))
  const currentMemberId = useAuthStore((s) => s.user?.memberId)
  const startImpersonationInNewTab = useImpersonationStore((s) => s.startInNewTab)

  // Tab item counts come from the member detail payload itself (folded into GET /members/{id}), so opening
  // a member is ONE request — no more firing five secondary list queries just to render these badges.
  const counts = member?.counts
  const unitesCount = counts?.unites ?? 0
  const dossierCount = (counts?.documents ?? 0) + (counts?.cotisations ?? 0)
  const progressionCount = counts?.progression ?? 0
  // Tab definitions — shared by the desktop tab bar and the mobile dropdown so their labels/counts can't drift.
  const tabDefs: { value: string; label: string; count?: number }[] = [
    { value: 'info', label: 'Informations' },
    { value: 'famille', label: 'Contact & famille' },
    { value: 'unites', label: 'Unités / Fonctions', count: unitesCount },
    { value: 'dossier', label: 'Documents & cotisations', count: dossierCount },
    { value: 'progression', label: 'Progression', count: progressionCount },
    { value: 'medical', label: 'Santé & suivi' },
    ...(canViewAudit ? [{ value: 'journal', label: 'Journal' }] : []),
  ]

  const pinnedNationalities = useSettingArray('pinned_nationalities')
  const schools = useSettingArray('member.schools')
  const classes = useSettingArray('member.classes')
  const professionDomains = useSettingArray('member.profession_domains')
  // Per-year absence breakdown (leader-only endpoint — the member never sees this). Shown on the Médical tab.
  const { data: absencesByYear } = useMemberAbsencesByYear(memberId)

  // Profil + Scolarité + Médical share one inline edit form (the header "Modifier" button).
  const [editing, setEditing] = useState(false)
  // Controlled tabs: the edit form only lives on Informations + Médical, so the "Modifier"/Save controls are
  // shown ONLY on those tabs (else a CU on Documents/Progression sees Save with no form and persists stale data).
  const [activeTab, setActiveTab] = useState('info')
  const isFormTab = activeTab === 'info' || activeTab === 'medical'
  const [form, setForm] = useState<MemberFormData>({ firstName: '', lastName: '' })
  // "Situation" toggle: 'student' shows Classe/Section, 'working' shows Domaine/Profession. The hidden side is
  // cleared on save so a member is never both. Derived from the data when opening the edit form.
  const [situation, setSituation] = useState<'student' | 'working'>('student')
  const [error, setError] = useState('')

  // Reset password (one-time credentials).
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetCreds, setResetCreds] = useState<{ username: string; password: string; sentToEmail: string | null } | null>(null)
  const [loginToggleOpen, setLoginToggleOpen] = useState(false)
  // Username-edit dialog: null = closed, otherwise the value being typed (seeded from the current identifier).
  const [usernameEdit, setUsernameEdit] = useState<string | null>(null)

  // Access delegation ("accès délégué") — CG grants this member extra hidden access (full CG or per-area).
  const [delegationOpen, setDelegationOpen] = useState(false)

  // Delete member (soft-delete → Corbeille, restorable until the purge job runs).
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const handleDelete = async () => {
    try {
      const deletedId = memberId
      await deleteMember.mutateAsync(deletedId)
      // Undo affordance: restore the soft-deleted member in one tap (also always recoverable via the Corbeille).
      toast.success('Membre supprimé', {
        description: 'Récupérable dans la Corbeille.',
        action: {
          label: 'Annuler',
          onClick: () => restoreMember.mutate(deletedId, {
            onSuccess: () => toast.success('Suppression annulée'),
            onError: (e) => toast.error(parseApiError(e)),
          }),
        },
      })
      setDeleteConfirmOpen(false)
      onDeleted()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  // Absence details popup: the selected scout year's absences (dates + réunion details).
  const [absenceYear, setAbsenceYear] = useState<MemberAbsenceYear | null>(null)

  // (Coordonnées add/edit/delete now live in the shared <HouseholdContacts> component.)

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
      professionDomain: member.professionDomain ?? '', profession: member.profession ?? '',
      medicalNotes: member.medicalNotes ?? '', allergies: member.allergies ?? '', notes: member.notes ?? '',
      parentsSituation: member.parentsSituation ?? '',
    })
    // A member with a profession filled is "working"; otherwise default to "student". Youth branches never
    // offer profession (member.showProfession = false), so force "student" there.
    setSituation(member.showProfession && (member.professionDomain || member.profession) ? 'working' : 'student')
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
    // Classe optional: older members (Clan/Noyau/maîtrise) fill Profession instead.
    if (missing.length) { setError(`Champs requis manquants : ${missing.join(', ')}.`); return }
    try {
      await updateMember.mutateAsync({
        id: memberId, ...form,
        dateOfBirth: form.dateOfBirth || null, gender: form.gender || null,
        cardNumber: form.cardNumber || null, externalCardNumber: form.externalCardNumber || null,
        bloodType: form.bloodType || null, nationality: form.nationality || null,
        school: form.school || null,
        // Mutually exclusive by "situation": a student keeps classe/section (profession cleared); a working
        // member keeps domaine/profession (classe/section cleared) — so a member is never shown as both.
        classe: situation === 'student' ? (form.classe || null) : null,
        section: situation === 'student' ? (form.section || null) : null,
        professionDomain: situation === 'working' ? (form.professionDomain || null) : null,
        profession: situation === 'working' ? (form.profession || null) : null,
        medicalNotes: form.medicalNotes || null, allergies: form.allergies || null, notes: form.notes || null,
        parentsSituation: form.parentsSituation || null,
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

  // Enable/disable the member's login (reversible; the member record is untouched).
  const handleToggleLogin = async () => {
    const active = !(member?.loginActive ?? true) // if currently active → disable
    try {
      await setLoginActive.mutateAsync({ id: memberId, active })
      toast.success(active ? 'Connexion réactivée' : 'Connexion désactivée')
    } catch (err) { toast.error(parseApiError(err)) }
    finally { setLoginToggleOpen(false) }
  }

  // Save the edited login username (identifier). Closes the dialog on success.
  const saveUsername = async () => {
    const next = usernameEdit?.trim()
    if (!next || next === member?.username) { setUsernameEdit(null); return }
    try {
      await updateUsername.mutateAsync(next)
      toast.success('Identifiant modifié')
      setUsernameEdit(null)
    } catch (err) { toast.error(parseApiError(err)) }
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

  // Enter "Voir comme" in a NEW tab so the admin keeps their own session in this tab. The new tab mints + adopts
  // the read-only token and lands on the member's dashboard; the amber banner there drives the exit.
  const handleImpersonate = () => startImpersonationInNewTab(memberId)

  const downloadCard = async () => {
    try {
      const response = await generateMemberCard(memberId)
      saveBlob(response.data, `Carte_${member.firstName}_${member.lastName}.pdf`, 'application/pdf')
    } catch (err) { toast.error(await parseBlobError(err)) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header — always visible: identity, login username + reset, card PDF, edit toggle.
          @container so the layout responds to the DETAIL PANE width (master/detail split), not the viewport. */}
      <div className="@container shrink-0 border-b px-4 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <MemberPhoto memberId={memberId} name={`${member.firstName} ${member.lastName}`} photoPath={member.photoPath} size={48} editable />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold">{member.firstName} {member.lastName}</h2>
            {/* Header focuses on the login account (card N°/genre/DOB live in the Informations tab). Line 2 =
                identifiant; line 3 = last sign-in, or "Jamais connecté" for an account that never logged in. */}
            {/* Single-line identifiant: the username TRUNCATES (full value on hover + a copy button) rather than
                breaking character-by-character when the detail pane is narrow. */}
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {member.username
                ? <>
                    <span className="shrink-0">Identifiant :</span>
                    <span className="min-w-0 truncate font-medium text-foreground" title={member.username}>{member.username}</span>
                    <CopyButton value={member.username} label="Copier l'identifiant" className="shrink-0" />
                    {canEdit && (
                      <Tip content="Modifier l'identifiant de connexion">
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Modifier l'identifiant"
                          onClick={() => setUsernameEdit(member.username ?? '')}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </Tip>
                    )}
                  </>
                : <span className="italic">Aucun compte utilisateur</span>}
            </p>
            {/* Status metadata — ONE wrapped row of compact chips (used to be a growing stack of full-width
                lines as features piled on: last login, contact-review state, app-install detection, delegation).
                Exact dates for the state chips are on hover (title) to keep the row short. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
              {member.username && (
                member.lastLoginAt
                  ? <span className="text-muted-foreground">Connexion : {new Date(member.lastLoginAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  : <span className="font-medium text-amber-600 dark:text-amber-400">Jamais connecté</span>
              )}
              {member.username && member.loginActive === false && (
                <span className="inline-flex items-center gap-1 font-medium text-destructive"><Lock className="h-3 w-3" />Connexion désactivée</span>
              )}
              {/* Contact-review state: did the member confirm/fix their coordonnées via the one-time popup? */}
              {member.contactReviewedAt
                ? <span title={`Vérifiées le ${new Date(member.contactReviewedAt).toLocaleDateString('fr-FR')}`} className="text-emerald-600 dark:text-emerald-400">Coordonnées vérifiées</span>
                : <span className="font-medium text-amber-600 dark:text-amber-400">Coordonnées à vérifier</span>}
              {/* PWA install (best-effort): "installée" = detected running standalone; else "non détectée". */}
              {member.username && (
                member.appInstalledAt
                  ? <span title={`Détectée le ${new Date(member.appInstalledAt).toLocaleDateString('fr-FR')}`} className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Smartphone className="h-3 w-3" />App installée</span>
                  : <span className="inline-flex items-center gap-1 text-muted-foreground"><Smartphone className="h-3 w-3" />App non détectée</span>
              )}
              {/* Access delegation — visible to the CG so they know this member holds hidden extra access. */}
              {member.hasDelegatedAccess && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary"><ShieldCheck className="h-3 w-3" />{member.delegatedGroupAccess ? 'Accès délégué : CG' : 'Accès délégué'}</span>
              )}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 @lg:w-auto @lg:shrink-0 @lg:justify-end">
            {/* Favorite toggle (per-device) — surfaces this member in the Ctrl-K palette's "Favoris". */}
            {!editing && (
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                onClick={() => setFav(toggleFavoriteMember({ id: memberId, name: `${member.firstName} ${member.lastName}` }))}>
                <Star className={`h-4 w-4 ${fav ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
              </Button>
            )}
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
                  {canResetPassword && member.username && member.loginActive !== null && (
                    <DropdownMenuItem onClick={() => setLoginToggleOpen(true)}>
                      {member.loginActive
                        ? <><Lock className="mr-2 h-4 w-4" />Désactiver la connexion</>
                        : <><Unlock className="mr-2 h-4 w-4" />Réactiver la connexion</>}
                    </DropdownMenuItem>
                  )}
                  {cardsEnabled && (
                    <DropdownMenuItem onClick={downloadCard}>
                      <CreditCard className="mr-2 h-4 w-4" />Télécharger la carte de membre
                    </DropdownMenuItem>
                  )}
                  {canDelegate && (
                    <DropdownMenuItem onClick={() => setDelegationOpen(true)}>
                      <ShieldCheck className="mr-2 h-4 w-4" />Délégation d'accès
                    </DropdownMenuItem>
                  )}
                  {canImpersonate && currentMemberId !== memberId && !member.isSuperAdmin && (
                    <DropdownMenuItem onClick={handleImpersonate}>
                      <Eye className="mr-2 h-4 w-4" />Voir comme ce membre (nouvel onglet)
                    </DropdownMenuItem>
                  )}
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
        {/* Mobile: a dropdown (7 tabs scroll awkwardly on a phone — the active one can sit off-screen).
            Desktop: the horizontal tab bar. Both drive the controlled `activeTab`. */}
        <div className="mx-4 mt-3 shrink-0 md:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tabDefs.map(t => <SelectItem key={t.value} value={t.value}>{t.label}{t.count ? ` (${t.count})` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <TabsList className="mx-4 mt-3 hidden shrink-0 justify-start overflow-x-auto flex-nowrap md:flex">
          {tabDefs.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}<TabCount n={t.count ?? 0} /></TabsTrigger>)}
        </TabsList>

        <div className="flex-1 overflow-auto p-4">
          <TabsContent value="info" className="mt-0 space-y-6">
            {error && editing && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

            {/* Identité — the member photo lives here now (the standalone hero that duplicated the name,
                matricule and identity chips was removed; age shows next to the DOB below, sexe/nationalité are
                fields, groupe sanguin is on the Santé tab). */}
            <Section icon={User} title="Identité">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="flex shrink-0 flex-col items-center gap-2 sm:items-start">
                  <MemberPhoto memberId={memberId} name={`${member.firstName} ${member.lastName}`} photoPath={member.photoPath} size={120} height={156} rounded="rounded-xl" editable className="shadow-sm ring-1 ring-border" />
                  {member.absencesThisYear > 0 && (
                    <Tip content="Absences aux réunions cette année scoute">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                        <CalendarCheck className="h-3.5 w-3.5" />{member.absencesThisYear} absence{member.absencesThisYear > 1 ? 's' : ''}
                      </span>
                    </Tip>
                  )}
                </div>
                <div className="min-w-0 flex-1">
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
                  {/* Situation des parents (household attribute; from the demande wizard, editable here). */}
                  <div className="space-y-1.5">
                    <RequiredLabel>Situation des parents</RequiredLabel>
                    <Select value={form.parentsSituation || ''} onValueChange={(v) => setForm(f => ({ ...f, parentsSituation: v === '__clear__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Non précisé" /></SelectTrigger>
                      <SelectContent>
                        {form.parentsSituation && <SelectItem value="__clear__">— Non précisé —</SelectItem>}
                        {PARENTS_SITUATION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
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
                  <Field label="Situation des parents" value={member.parentsSituation} />
                </div>
              )}
                </div>
              </div>
            </Section>

            <Section icon={GraduationCap} title="Scolarité">
              {editing ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1.5">
                    <RequiredLabel required>École</RequiredLabel>
                    {/* Searchable dropdown + "Autre…" free-text (snaps typed variants onto the canonical school). */}
                    <SchoolSelect value={form.school || ''} onChange={(v) => setForm(f => ({ ...f, school: v }))} schools={schools} />
                  </div>
                  {/* Situation toggle (only for older members — youth in Meute/Ronde/Compagnie/Troupe are
                      Classe/Section only, so the toggle is hidden and situation stays 'student'). */}
                  {member.showProfession && (
                    <div className="space-y-1.5 sm:col-span-2 xl:col-span-3">
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
                      <div className="space-y-1.5">
                        <RequiredLabel>Classe</RequiredLabel>
                        <Select value={form.classe || ''} onValueChange={(v) => setForm(f => ({ ...f, classe: v === '__clear__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            {form.classe && <SelectItem value="__clear__">— Aucune —</SelectItem>}
                            {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5"><RequiredLabel>Section</RequiredLabel><Input value={form.section || ''} onChange={(e) => setForm(f => ({ ...f, section: e.target.value.slice(0, 5) }))} placeholder="Ex: SV, SE..." maxLength={5} /></div>
                    </>
                  ) : (
                    <>
                      {/* Working member (Clan/Noyau/maîtrise): a Domaine category + a free-text job title. */}
                      <div className="space-y-1.5">
                        <RequiredLabel>Domaine</RequiredLabel>
                        <Select value={form.professionDomain || ''} onValueChange={(v) => setForm(f => ({ ...f, professionDomain: v === '__clear__' ? '' : v }))}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            {form.professionDomain && <SelectItem value="__clear__">— Aucun —</SelectItem>}
                            {professionDomains.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5"><RequiredLabel>Profession</RequiredLabel><Input value={form.profession || ''} onChange={(e) => setForm(f => ({ ...f, profession: e.target.value }))} placeholder="Ex: Ingénieur, Médecin..." maxLength={150} /></div>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
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
                </div>
              )}
            </Section>

          </TabsContent>

          {/* Contact & famille — the member's own coordonnées merged with their parents + fratrie (contact edits
              are gated on canEdit, so they're available directly here without the Informations "Modifier" mode). */}
          <TabsContent value="famille" className="mt-0 space-y-6">
            <HouseholdContacts memberId={memberId} canEdit={canEdit} />
            <MemberGuardians memberId={memberId} hideContacts />
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
              <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><CalendarCheck className="h-4 w-4 text-primary/70" />Absences aux réunions</h4>
              {absencesByYear && absencesByYear.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {absencesByYear.map(a => (
                    <button
                      key={a.scoutYear}
                      type="button"
                      onClick={() => setAbsenceYear(a)}
                      title="Voir le détail des absences"
                      className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm transition hover:bg-muted"
                    >
                      <span className="text-muted-foreground">{a.scoutYear}</span>
                      <span className="font-semibold tabular-nums">{a.count}</span>
                      <span className="text-muted-foreground">absence{a.count > 1 ? 's' : ''}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune absence enregistrée.</p>
              )}
            </div>
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Contact className="h-4 w-4 text-primary/70" />Infos complémentaires</h4>
              <MemberCustomFields memberId={memberId} />
            </div>
          </TabsContent>

          {/* Journal — this member's audit trail (CG/admin only). */}
          {canViewAudit && (
            <TabsContent value="journal" className="mt-0">
              <MemberAuditLog memberId={memberId} />
            </TabsContent>
          )}
        </div>
      </Tabs>

      {/* Absence details popup: the selected scout year's absences (dates + réunion details). */}
      <Dialog open={!!absenceYear} onOpenChange={(o) => !o && setAbsenceYear(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Absences {absenceYear?.scoutYear} — {absenceYear?.count} réunion{(absenceYear?.count ?? 0) > 1 ? 's' : ''}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {absenceYear?.absences.map((a, i) => (
              <div key={i} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{formatAbsenceDate(a.date, a.endDate)}</span>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{MEETING_TYPE_LABELS[a.type] ?? a.type}</span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {a.title ? <span>{a.title} · </span> : null}
                  {a.unitName}{a.teamName ? ` · ${a.teamName}` : ''}
                </div>
                {a.reason ? <div className="mt-1"><span className="text-muted-foreground">Motif : </span>{a.reason}</div> : null}
              </div>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAbsenceYear(null)}>Fermer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accès délégué (CG/super-admin) */}
      {canDelegate && (
        <DelegationDialog memberId={memberId} memberName={`${member.firstName} ${member.lastName}`}
          open={delegationOpen} onOpenChange={setDelegationOpen} />
      )}

      {/* Delete member (soft-delete → Corbeille) */}
      <ConfirmDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen} title="Supprimer le membre"
        description={`${member.firstName} ${member.lastName} sera déplacé(e) vers la Corbeille (son compte est désactivé). Vous pourrez le/la restaurer jusqu'à sa suppression définitive automatique. Continuer ?`}
        confirmLabel="Supprimer" variant="destructive" loading={deleteMember.isPending} onConfirm={handleDelete} />

      {/* Edit the login username (identifier) */}
      <Dialog open={usernameEdit !== null} onOpenChange={(o) => !o && setUsernameEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'identifiant</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              L'identifiant est ce que <strong>{member.firstName} {member.lastName}</strong> saisit pour se connecter
              (au format <code className="rounded bg-muted px-1">prenom.nom@scouts.gndj</code>). Cela ne change que la
              connexion — pas l'adresse email de contact. Prévenez le membre du nouvel identifiant.
            </p>
            <div className="space-y-1.5">
              <RequiredLabel htmlFor="username-edit">Identifiant de connexion</RequiredLabel>
              <Input id="username-edit" value={usernameEdit ?? ''} onChange={(e) => setUsernameEdit(e.target.value)}
                autoComplete="off" spellCheck={false} placeholder="prenom.nom@scouts.gndj"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveUsername() } }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsernameEdit(null)}>Annuler</Button>
            <Button onClick={saveUsername} disabled={updateUsername.isPending || !usernameEdit?.trim() || usernameEdit.trim() === member.username}>
              {updateUsername.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <ConfirmDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen} title="Réinitialiser le mot de passe"
        description={`Un nouveau mot de passe temporaire sera généré pour ${member.firstName} ${member.lastName}. Les sessions actives seront déconnectées. Continuer ?`}
        confirmLabel="Réinitialiser" loading={resetPassword.isPending} onConfirm={handleResetPassword} />
      <ConfirmDialog open={loginToggleOpen} onOpenChange={setLoginToggleOpen}
        title={member.loginActive ? 'Désactiver la connexion' : 'Réactiver la connexion'}
        description={member.loginActive
          ? `${member.firstName} ${member.lastName} ne pourra plus se connecter (la fiche et les données sont conservées). Les sessions actives seront déconnectées. Cette action est réversible.`
          : `${member.firstName} ${member.lastName} pourra à nouveau se connecter avec son identifiant habituel.`}
        confirmLabel={member.loginActive ? 'Désactiver' : 'Réactiver'} loading={setLoginActive.isPending} onConfirm={handleToggleLogin} />
      <Dialog open={!!resetCreds} onOpenChange={() => setResetCreds(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mot de passe réinitialisé</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {resetCreds?.sentToEmail
              ? <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm text-green-800 dark:text-green-300">Un email avec le mot de passe temporaire a été envoyé à <strong>{resetCreds.sentToEmail}</strong>. Le membre devra le changer à la première connexion.</div>
              : <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 text-sm text-amber-800 dark:text-amber-300">Aucune adresse email sur la fiche : communiquez ces informations manuellement au membre.</div>}
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
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(credentialsMessage(resetCreds?.username ?? '', resetCreds?.password ?? '')); toast.success('Identifiants copiés !') }}>
              <Copy className="mr-1.5 h-4 w-4" />Copier le message
            </Button>
            <Button onClick={() => setResetCreds(null)}>Fermer</Button>
          </DialogFooter>
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
  const professionDomains = useSettingArray('member.profession_domains')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [page, setPage] = useState(1)
  // Remember the last view (unit filter + Actifs/Anciens) between visits — a CU almost always works one unit.
  const [unitFilter, setUnitFilter] = useState<string>(() => localStorage.getItem('members.unitFilter') ?? 'all')
  // View: Actifs (default) / Anciens / Tous (both, for searching across active + former at once).
  const [viewMode, setViewMode] = useState<'active' | 'alumni' | 'all'>(() => {
    const v = localStorage.getItem('members.viewMode')
    return v === 'alumni' || v === 'all' ? v : 'active'
  })
  const showAlumni = viewMode === 'alumni'
  const showAll = viewMode === 'all'
  useEffect(() => { localStorage.setItem('members.unitFilter', unitFilter) }, [unitFilter])
  useEffect(() => { localStorage.setItem('members.viewMode', viewMode) }, [viewMode])
  // Names per page (persisted) + family-name A–Z index (transient jump within the current view).
  const [pageSize, setPageSize] = useState<number>(() => {
    const v = Number(localStorage.getItem('members.pageSize'))
    return [25, 50, 100, 200].includes(v) ? v : 50
  })
  useEffect(() => { localStorage.setItem('members.pageSize', String(pageSize)) }, [pageSize])
  const [letter, setLetter] = useState('')
  // PWA install filter: all / installed (app détectée) / not (non détectée). Lets the CG pull "who installed".
  const [appFilter, setAppFilter] = useState<'all' | 'installed' | 'not'>('all')
  // Mobile: the secondary filters (page size, app filter, A–Z index) collapse behind a "Filtres" toggle so the
  // list header stays short on a phone. On desktop (md+) they're always shown inline.
  const [showMoreFilters, setShowMoreFilters] = useState(false)
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
  const [importOpen, setImportOpen] = useState(false)

  // Create dialog
  const [formOpen, setFormOpen] = useState(false)
  const [credentialsDialog, setCredentialsDialog] = useState<{ username: string; password: string; memberId: string } | null>(null)
  const [form, setForm] = useState<MemberFormData>({ firstName: '', lastName: '' })
  // Situation toggle (create): 'student' = Classe/Section, 'working' = Domaine/Profession.
  const [situation, setSituation] = useState<'student' | 'working'>('student')
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
  const { data: unitOptions } = useMemberUnitOptions(showAlumni, showAll)
  const { data: units } = useUnits({ pageSize: 100 })

  // If the selected unit vanished from the options for the current view (e.g. it's empty under Actifs), fall
  // back to "Toutes les unités" so the list isn't stuck on a hidden unit. Render-phase reset (same idiom as the
  // route-member sync above); only fires while a real-but-missing unit is selected, so it can't loop.
  if (unitOptions && !isSpecialFilter && !unitOptions.some(u => u.id === unitFilter)) {
    setUnitFilter('all')
    setPage(1)
  }

  // Create form: hide the "En activité" option when the chosen unit is a youth branch (Meute/Ronde/Compagnie/
  // Troupe) — those members fill Classe/Section only. createSituation = effective situation (forced 'student').
  const createSelectedUnit = units?.items.find(u => u.id === form.unitId)
  const createIsYouthUnit = !!createSelectedUnit && YOUTH_BRANCH_CODES.includes(createSelectedUnit.unitTypeCode)
  const createSituation = createIsYouthUnit ? 'student' : situation

  const { data, isLoading } = useMembers({
    search: debouncedSearch || undefined,
    unitId, noUnit, maitrise,
    alumni: showAlumni || undefined,
    all: showAll || undefined,
    sortBy, sortDir,
    page, pageSize, letter: letter || undefined,
    appInstalled: appFilter === 'installed' ? true : appFilter === 'not' ? false : undefined,
  })

  // The selected member's detail (cached — the detail panel fetches the same ['members', id] key, so no extra
  // request). Used to PIN the selected member at the top of the list when they're not in the current filtered/
  // paged page (deep link from the birthdays card / a notification / the command palette) so they're always
  // visible + highlighted, without silently mutating the user's filters.
  const { data: selectedDetail } = useMember(selectedMemberId ?? '')
  const selectedInList = !!(selectedMemberId && data?.items.some(m => m.id === selectedMemberId))
  const pinnedMember = !selectedInList && selectedMemberId && selectedDetail?.id === selectedMemberId ? selectedDetail : null

  const createMutation = useCreateMember()

  // Absence counts for the selected unit (active view only, running calendar scout year) → a small badge per row.
  const { data: absenceCountsRaw } = useUnitAbsenceCounts(unitId, calendarScoutYear(), !!unitId && viewMode === 'active')
  const absenceCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of absenceCountsRaw ?? []) m.set(a.memberId, a.count)
    return m
  }, [absenceCountsRaw])

  const openCreate = () => {
    setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: '', bloodType: '', nationality: '', school: defaultSchool ?? '', classe: '', professionDomain: '', profession: '', section: '', externalCardNumber: '', fatherName: '', motherName: '', motherMaidenName: '', unitId: '' })
    setSituation('student')
    setError(''); clearAll()
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ firstName: !form.firstName, lastName: !form.lastName })) return
    try {
      const payload = { ...form, dateOfBirth: form.dateOfBirth || null, gender: form.gender || null, bloodType: form.bloodType || null, nationality: form.nationality || null, school: form.school || null,
        // Mutually exclusive by situation (student keeps classe/section, working keeps domaine/profession).
        classe: createSituation === 'student' ? (form.classe || null) : null, section: createSituation === 'student' ? (form.section || null) : null,
        professionDomain: createSituation === 'working' ? (form.professionDomain || null) : null, profession: createSituation === 'working' ? (form.profession || null) : null,
        fatherName: form.fatherName || null, motherName: form.motherName || null, motherMaidenName: form.motherMaidenName || null, unitId: form.unitId || null }
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
      {/* Top bar — all list chrome (title, actions, filters, A–Z). Hidden on mobile while a member's fiche is
          open so the detail panel gets the full screen (the fiche has its own "Retour à la liste" back button). */}
      <div className={cn('shrink-0 space-y-3 pb-3', selectedMemberId && 'max-md:hidden')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Membres</h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* Span wrapper so the tooltip still fires when the button is disabled (Radix skips disabled triggers). */}
            <Tip content={isSpecialFilter ? 'Sélectionnez une unité pour exporter' : "Exporter l'unité en Excel ou CSV"}>
              <span className="inline-flex">
                <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} disabled={isSpecialFilter}>
                  <FileSpreadsheet className="mr-1 h-4 w-4" />
                  Exporter
                </Button>
              </span>
            </Tip>
            {canCreate && <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />Importer</Button>}
            {canCreate && <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />Nouveau membre</Button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search — full width on mobile, flexible beside the filters on ≥sm */}
          <div className="relative w-full sm:flex-1 sm:min-w-[10rem] sm:max-w-sm">
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
          {/* Unit filter — full width on mobile so it doesn't crowd the search */}
          <Select value={unitFilter} onValueChange={(v) => { setUnitFilter(v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-52 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les unités</SelectItem>
              <SelectItem value="maitrises">Maîtrises</SelectItem>
              {/* Only units that have members in the current view (Actifs / Anciens) — empty units are hidden. */}
              {unitOptions?.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.count})</SelectItem>)}
              {/* Export is enabled only for a concrete unit (not 'all'/'maitrises'/'none') — unit-scoped report */}
              <SelectItem value="none">Sans unité</SelectItem>
            </SelectContent>
          </Select>
          {/* Actifs / Anciens / Tous toggle. "Tous" searches across active + former members at once. */}
          <div className="flex h-8 shrink-0 items-center rounded-md border p-0.5 text-xs">
            {([['active', 'Actifs'], ['alumni', 'Anciens'], ['all', 'Tous']] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={cn('h-full rounded px-2.5 font-medium transition-colors', viewMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => { setViewMode(mode); setPage(1) }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Mobile-only: reveal the secondary filters (page size, app filter, A–Z) to keep the header short.
              A dot signals that one of them is active while collapsed. */}
          <button
            type="button"
            onClick={() => setShowMoreFilters(v => !v)}
            className="md:hidden inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium text-muted-foreground"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />Filtres
            {(appFilter !== 'all' || letter) && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showMoreFilters && 'rotate-180')} />
          </button>
          {/* Page size + app filter — inline on desktop (display:contents makes this wrapper transparent), a
              collapsible full-width row on mobile. */}
          <div className={cn('md:contents', showMoreFilters ? 'max-md:flex max-md:w-full max-md:flex-wrap max-md:items-center max-md:gap-2' : 'max-md:hidden')}>
            {/* Names per page */}
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[6.5rem] max-md:flex-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
              </SelectContent>
            </Select>
            {/* PWA install filter — "app détectée" = ran the installed app at least once; "non détectée" is
                best-effort (no reliable "not installed" signal). Count via the range indicator. */}
            <Select value={appFilter} onValueChange={(v) => { setAppFilter(v as typeof appFilter); setPage(1) }}>
              <SelectTrigger className="h-8 w-40 max-md:flex-1 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">App : tous</SelectItem>
                <SelectItem value="installed">App installée</SelectItem>
                <SelectItem value="not">App non détectée</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {data && data.totalCount > 0 && (
            <span className="flex items-center text-xs text-muted-foreground">
              {(data.page - 1) * pageSize + 1}–{Math.min(data.page * pageSize, data.totalCount)} sur {data.totalCount}
            </span>
          )}
        </div>

        {/* Family-name A–Z index — jump to a starting letter (accent-insensitive). "Tous" clears it.
            Always visible on desktop; on mobile it's part of the collapsible "Filtres" section. */}
        <div className={cn('flex flex-wrap gap-0.5', !showMoreFilters && 'max-md:hidden')}>
          <button
            type="button"
            onClick={() => { setLetter(''); setPage(1) }}
            className={cn('h-6 rounded px-1.5 text-[11px] font-medium transition-colors',
              letter === '' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            Tous
          </button>
          {ALPHABET.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => { setLetter(l); setPage(1) }}
              className={cn('h-6 min-w-[1.5rem] rounded px-1 text-[11px] font-medium transition-colors',
                letter === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            >
              {l}
            </button>
          ))}
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
            <div className="w-12 shrink-0 text-xs">
              <SortHeader label="Unité" field="unit" current={sortBy} dir={sortDir} onSort={handleSort} />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto bg-muted/20">
            {/* Deep-linked member (birthdays card / notification / command palette) who isn't on the current
                filtered/paged page: pin them at the top, highlighted, so the user always sees who's selected
                without silently changing their filters. Hidden once they appear in the list itself. */}
            {pinnedMember && (
              <div className="flex items-center gap-2 border-b-2 border-l-2 border-l-primary border-b-primary/30 bg-primary/10 px-3 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-medium shrink-0">
                  {pinnedMember.firstName[0]}{pinnedMember.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pinnedMember.lastName} {pinnedMember.firstName}</p>
                  <p className="text-[11px] text-primary/70">Sélectionné · hors de la liste filtrée</p>
                </div>
              </div>
            )}
            {isLoading ? <div className="flex items-center justify-center h-full"><LoadingSpinner /></div> :
             !data || data.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                {debouncedSearch ? <Search className="h-8 w-8 opacity-40" /> : <User className="h-8 w-8 opacity-40" />}
                <p className="text-sm">{debouncedSearch ? `Aucun résultat pour « ${debouncedSearch} »` : letter ? `Aucun nom commençant par « ${letter} »` : 'Aucun membre trouvé'}</p>
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
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          <CalendarCheck className="h-3 w-3" />{absenceCounts.get(m.id)}
                        </span>
                      </Tip>
                    ) : null}
                    <div className="shrink-0"><ComplianceDot docsComplete={m.docsComplete} cotisationOk={m.cotisationOk} /></div>
                    <div className="w-12 shrink-0 text-[11px] text-muted-foreground text-center">{m.unitName ?? '—'}</div>
                  </div>
                ))}
                {/* Pagination — Préc./Suiv. + a page picker to jump directly to any page. */}
                {data.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1.5 p-2 border-t bg-muted/30">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={!data.hasPreviousPage} onClick={() => setPage(p => p - 1)}>Préc.</Button>
                    <Select value={String(data.page)} onValueChange={(v) => setPage(Number(v))}>
                      <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {Array.from({ length: data.totalPages }, (_, i) => i + 1).map(n => (
                          <SelectItem key={n} value={String(n)} className="text-xs">Page {n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">/ {data.totalPages}</span>
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
                {/* Searchable dropdown + "Autre…" free-text (snaps typed variants onto the canonical school). */}
                <SchoolSelect value={form.school || ''} onChange={(v) => setForm(f => ({ ...f, school: v }))} schools={schools} />
              </div>
              {/* Situation toggle — hidden when a youth-branch unit is selected (Meute/Ronde/Compagnie/Troupe →
                  Classe/Section only). For older branches or no unit, the CG chooses. */}
              {!createIsYouthUnit && (
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
              {createSituation === 'student' ? (
                <>
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
                  <div className="space-y-2">
                    <RequiredLabel>Section</RequiredLabel>
                    <Input value={form.section || ''} onChange={(e) => setForm(f => ({ ...f, section: e.target.value.slice(0, 5) }))} placeholder="Ex: SV, SE..." maxLength={5} />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <RequiredLabel>Domaine</RequiredLabel>
                    <Select value={form.professionDomain || ''} onValueChange={(v) => setForm(f => ({ ...f, professionDomain: v === '__clear__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__clear__">-- Aucun --</SelectItem>
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
            <div className="grid gap-4 sm:grid-cols-2">
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

      {/* Bulk import dialog (Excel/CSV) */}
      <MemberImportDialog open={importOpen} onOpenChange={setImportOpen} />

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
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(credentialsMessage(credentialsDialog?.username ?? '', credentialsDialog?.password ?? '')); toast.success('Identifiants copiés !') }}>
              <Copy className="mr-1.5 h-4 w-4" />Copier le message
            </Button>
            <Button onClick={() => { if (credentialsDialog) setSelectedMemberId(credentialsDialog.memberId); setCredentialsDialog(null) }}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
