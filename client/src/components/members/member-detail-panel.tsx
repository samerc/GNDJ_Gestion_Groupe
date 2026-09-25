// Member file (fiche) detail panel — the ONE member file shown to CG / super-admin (Membres page) AND to a CU
// (their unit roster). Header (identity, login, Actions ▾, Modifier) + tabs Informations / Contact & famille /
// Unités / Documents & cotisations / Progression / Santé & suivi (/ Journal). Every action and tab is gated by
// the viewer's permissions, so a CU simply sees fewer actions than a CG.
import { parseApiError, parseBlobError } from '@/lib/error-utils'
import { saveBlob } from '@/lib/download'
import { useState, useEffect, type ReactNode, type ComponentType } from 'react'
import { useImpersonationStore } from '@/stores/impersonation-store'
import { useMember, useUpdateMember, useDeleteMember, useRestoreMember, useResetMemberPassword, useSetMemberLoginActive, useSendAccess, useUpdateMemberUsername, type MemberFormData } from '@/services/member-service'
import { MemberPhoto } from '@/components/shared/member-photo'
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
import { generateMemberCard } from '@/services/report-service'
import { GENDER_OPTIONS, BLOOD_TYPE_OPTIONS, NATIONALITY_OPTIONS, PARENTS_SITUATION_OPTIONS } from '@/lib/options'
import { useMemberAbsencesByYear, type MemberAbsenceYear } from '@/services/meeting-service'
import { cn, computeAge } from '@/lib/utils'
import { ArrowLeft, Copy, CreditCard, FileSpreadsheet, User, GraduationCap, Contact, Droplet, Pencil, KeyRound, Save, Trash2, Send, CalendarCheck, ChevronDown, ShieldCheck, ListChecks, Star, Eye, Lock, Unlock, Smartphone } from 'lucide-react'
import { pushRecentMember, isFavoriteMember, toggleFavoriteMember } from '@/lib/recent-members'
import { DelegationDialog } from '@/pages/members/delegation-dialog'
import { AccessViewerDialog } from '@/pages/members/access-viewer-dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { credentialsMessage } from '@/lib/credentials'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value || '—'}</dd>
    </div>
  )
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

// Subtle count badge shown after a tab label (hidden when zero). Module scope so its identity is stable.
function TabCount({ n }: { n: number }) {
  if (!n) return null
  return <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{n}</span>
}

// ─── Member detail panel ─────────────────
export function MemberDetailPanel({ memberId, onDeleted, initialTab, onBack }: {
  memberId: string
  onDeleted?: () => void
  initialTab?: string
  // Mobile master/detail: shows a "Retour" arrow in the header that returns to the list.
  onBack?: () => void
}) {
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
  const canViewAccess = useAuthStore((s) => s.hasPermission(PERMISSIONS.MAITRISE_MANAGE)) // any group manager: voir les accès effectifs
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
  // initialTab lets a deep link (e.g. from the Fratries page) open straight on a given tab (validated below).
  const [activeTab, setActiveTab] = useState(() => tabDefs.some(t => t.value === initialTab) ? initialTab! : 'info')
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
  const [accessOpen, setAccessOpen] = useState(false) // "Voir les accès" effective-access viewer

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
      onDeleted?.()
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
          {onBack && (
            <Tip content="Retour à la liste">
              <Button variant="ghost" size="icon" className="-ml-2 shrink-0 md:hidden" onClick={onBack} aria-label="Retour à la liste">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Tip>
          )}
          <MemberPhoto memberId={memberId} name={`${member.firstName} ${member.lastName}`} photoPath={member.photoPath} size={48} editable={canEdit} />
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
                  {canViewAccess && (
                    <DropdownMenuItem onClick={() => setAccessOpen(true)}>
                      <ListChecks className="mr-2 h-4 w-4" />Voir les accès
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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Section de la fiche</label>
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="h-11 w-full border-2 border-primary/30 text-base font-semibold shadow-sm"><SelectValue /></SelectTrigger>
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
                  <MemberPhoto memberId={memberId} name={`${member.firstName} ${member.lastName}`} photoPath={member.photoPath} size={120} height={156} rounded="rounded-xl" editable={canEdit} className="shadow-sm ring-1 ring-border" />
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
            <MemberGuardians memberId={memberId} hideContacts readOnly={!canEdit} />
            <MemberSiblings memberId={memberId} canManage={canManageSiblings} linkable />
          </TabsContent>

          <TabsContent value="unites" className="mt-0">
            <MemberAssignments memberId={memberId} memberName="" readOnly={!canEdit} />
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

      {/* Voir les accès effectifs (tout gestionnaire de groupe) */}
      {canViewAccess && (
        <AccessViewerDialog memberId={memberId} memberName={`${member.firstName} ${member.lastName}`}
          open={accessOpen} onOpenChange={setAccessOpen} />
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
