import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { useFormValidation } from '@/hooks/use-form-validation'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useDebounce } from '@/hooks/use-debounce'
import { useMemberGuardians, useSearchGuardians, useCreateGuardian, useUpdateGuardian, useUpdateGuardianLink, useLinkGuardian, useUnlinkGuardian, useAddGuardianPhone, useAddGuardianEmail, useDeleteGuardianPhone, useDeleteGuardianEmail, useCreateMyGuardian, useUpdateMyGuardian, useUpdateMyGuardianLink, useUnlinkMyGuardian, useAddMyGuardianPhone, useAddMyGuardianEmail, useDeleteMyGuardianPhone, useDeleteMyGuardianEmail, type GuardianLinkDto, type GuardianSearchDto } from '@/services/guardian-service'
import { useSettingValue, useSettingArray } from '@/services/settings-service'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { PHONE_TYPE_OPTIONS, PHONE_COUNTRY_CODES, EMAIL_TYPE_OPTIONS, PROFESSION_OPTIONS } from '@/lib/options'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import { Plus, Pencil, Trash2, Phone, Mail, Search, UserPlus, Link } from 'lucide-react'

const RELATIONSHIP_OPTIONS = [
  { value: 'Père', label: 'Père' },
  { value: 'Mère', label: 'Mère' },
  { value: 'Tuteur', label: 'Tuteur' },
  { value: 'TuteurLégal', label: 'Tuteur légal' },
  { value: 'Autre', label: 'Autre' },
]

// Display label for a stored relationship type, matched accent/case-insensitively so imported values
// without accents (e.g. "Pere"/"Mere") still render as "Père"/"Mère". Falls back to the raw value.
const normRel = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function relationshipLabel(value: string): string {
  return RELATIONSHIP_OPTIONS.find(r => normRel(r.value) === normRel(value))?.label ?? value
}

// Initials for the guardian avatar (first letter of first + last name), uppercased.
function guardianInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?'
}

// "Famille" tab of the member detail page: parents/tutors (guardians) linked to this member,
// with their phones/emails. Guardians are SHARED entities — siblings reuse the same guardian
// record — so "Ajouter" offers two modes: search an existing guardian and LINK it (re-uses the
// shared record), or create a brand-new one. A guardian carries an activity Domaine + free-text
// Profession; each link carries the relationship type + primary/emergency-contact flags. Editing
// updates BOTH the shared guardian and this member's link (two mutations). Removing only unlinks
// (the guardian record survives for other members).
// selfService = the member editing their OWN famille from Ma fiche (own-scoped endpoints, no members.edit,
// and NO "search existing guardian" mode — a member must not enumerate other families). Leaders (member
// detail) get the full component incl. search/link.
interface MemberGuardiansProps { memberId: string; selfService?: boolean }

export function MemberGuardians({ memberId, selfService }: MemberGuardiansProps) {
  const { data: guardians } = useMemberGuardians(memberId)
  // Call BOTH hook sets unconditionally (rules of hooks), then pick per `selfService`. Mutations don't
  // fetch, so instantiating the unused set is free.
  const createL = useCreateGuardian(memberId), createS = useCreateMyGuardian(memberId)
  const updateL = useUpdateGuardian(memberId), updateS = useUpdateMyGuardian(memberId)
  const updateLinkL = useUpdateGuardianLink(memberId), updateLinkS = useUpdateMyGuardianLink(memberId)
  const unlinkL = useUnlinkGuardian(memberId), unlinkS = useUnlinkMyGuardian(memberId)
  const addPhoneL = useAddGuardianPhone(memberId), addPhoneS = useAddMyGuardianPhone(memberId)
  const addEmailL = useAddGuardianEmail(memberId), addEmailS = useAddMyGuardianEmail(memberId)
  const deletePhoneL = useDeleteGuardianPhone(memberId), deletePhoneS = useDeleteMyGuardianPhone(memberId)
  const deleteEmailL = useDeleteGuardianEmail(memberId), deleteEmailS = useDeleteMyGuardianEmail(memberId)
  const createMutation = selfService ? createS : createL
  const updateMutation = selfService ? updateS : updateL
  const updateLinkMutation = selfService ? updateLinkS : updateLinkL
  const linkMutation = useLinkGuardian(memberId) // leader-only (search/link); unused in selfService
  const unlinkMutation = selfService ? unlinkS : unlinkL
  const addPhoneMutation = selfService ? addPhoneS : addPhoneL
  const addEmailMutation = selfService ? addEmailS : addEmailL
  const deletePhoneMutation = selfService ? deletePhoneS : deletePhoneL
  const deleteEmailMutation = selfService ? deleteEmailS : deleteEmailL
  const defaultCountryCode = useSettingValue('default_country_code')
  const professionDomains = useSettingArray('member.profession_domains')
  const domainOptions = professionDomains.map(d => ({ value: d, label: d }))

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  // A member (selfService) can only CREATE a new guardian — never search/link an existing one.
  const [mode, setMode] = useState<'search' | 'create'>(selfService ? 'create' : 'search')
  const [searchText, setSearchText] = useState('')
  const debouncedSearch = useDebounce(searchText)
  const { data: searchResults } = useSearchGuardians(debouncedSearch)

  const [form, setForm] = useState({ firstName: '', lastName: '', profession: '', professionDomain: '', relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false, isDeceased: false })
  const [linkForm, setLinkForm] = useState({ guardianId: '', relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const [phoneDialog, setPhoneDialog] = useState<string | null>(null)
  const [emailDialog, setEmailDialog] = useState<string | null>(null)
  const [phoneForm, setPhoneForm] = useState({ countryCode: '+961', number: '', type: 'Mobile', isPrimary: false })
  const [emailForm, setEmailForm] = useState({ address: '', type: 'Personnel', isPrimary: false })
  const [unlinking, setUnlinking] = useState<GuardianLinkDto | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({ id: '', firstName: '', lastName: '', profession: '', professionDomain: '', isDeceased: false, notes: '', linkId: '', relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false })

  const openEdit = (gl: GuardianLinkDto) => {
    setEditForm({
      id: gl.guardianId, firstName: gl.guardian.firstName, lastName: gl.guardian.lastName,
      profession: gl.guardian.profession ?? '', professionDomain: gl.guardian.professionDomain ?? '', isDeceased: gl.guardian.isDeceased, notes: gl.guardian.notes ?? '',
      linkId: gl.linkId, relationshipType: gl.relationshipType, isPrimaryContact: gl.isPrimaryContact, isEmergencyContact: gl.isEmergencyContact,
    })
    setError('')
    setEditDialogOpen(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) { setError('Le prénom et le nom sont requis.'); return }
    try {
      // Save the shared guardian fields and the per-member link separately (two endpoints).
      await updateMutation.mutateAsync({ id: editForm.id, firstName: editForm.firstName, lastName: editForm.lastName, profession: editForm.profession || null, professionDomain: editForm.professionDomain || null, isDeceased: editForm.isDeceased, notes: editForm.notes || null })
      await updateLinkMutation.mutateAsync({ linkId: editForm.linkId, relationshipType: editForm.relationshipType, isPrimaryContact: editForm.isPrimaryContact, isEmergencyContact: editForm.isEmergencyContact })
      toast.success('Tuteur modifié')
      setEditDialogOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const openAdd = () => {
    setMode(selfService ? 'create' : 'search')
    setSearchText('')
    setForm({ firstName: '', lastName: '', profession: '', professionDomain: '', relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false, isDeceased: false })
    setError(''); clearAll()
    setAddDialogOpen(true)
  }

  // Pick a search result: stage it in linkForm (reveals the relationship picker + "Lier" inline).
  const selectExisting = (g: GuardianSearchDto) => {
    setLinkForm({ guardianId: g.id, relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false })
    setMode('search')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ firstName: !form.firstName, lastName: !form.lastName, relationshipType: !form.relationshipType })) return
    try {
      await createMutation.mutateAsync({ ...form, profession: form.profession || null, professionDomain: form.professionDomain || null })
      toast.success('Tuteur ajouté')
      setAddDialogOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleLink = async (guardianId: string) => {
    setError('')
    try {
      await linkMutation.mutateAsync({ ...linkForm, guardianId })
      toast.success('Tuteur ajouté')
      setAddDialogOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleUnlink = async () => {
    if (!unlinking) return
    try { await unlinkMutation.mutateAsync(unlinking.linkId); toast.success('Tuteur dissocié'); setUnlinking(null) } catch (err) { setError(parseApiError(err)); setUnlinking(null) }
  }

  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneDialog) return
    try {
      await addPhoneMutation.mutateAsync({ guardianId: phoneDialog, ...phoneForm })
      toast.success('Téléphone ajouté')
      setPhoneDialog(null)
      setPhoneForm({ countryCode: defaultCountryCode ?? '+961', number: '', type: 'Mobile', isPrimary: false })
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailDialog) return
    try {
      await addEmailMutation.mutateAsync({ guardianId: emailDialog, ...emailForm })
      toast.success('Email ajouté')
      setEmailDialog(null)
      setEmailForm({ address: '', type: 'Personnel', isPrimary: false })
    } catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd}><Plus className="mr-1 h-3 w-3" />Ajouter un parent</Button>
      </div>

      {!guardians || guardians.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aucun parent ou tuteur enregistré.</CardContent></Card>
      ) : (
        guardians.map(gl => (
          <Card key={gl.linkId} className="overflow-hidden">
            {/* Header: avatar with initials + name, relationship/flag badges, edit/remove actions. */}
            <CardHeader className="border-b bg-muted/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {guardianInitials(gl.guardian.firstName, gl.guardian.lastName)}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <CardTitle className="text-base leading-tight">{gl.guardian.firstName} {gl.guardian.lastName}</CardTitle>
                      <Badge variant="outline">{relationshipLabel(gl.relationshipType)}</Badge>
                      {gl.guardian.isDeceased && <Badge variant="secondary">Décédé(e)</Badge>}
                      {gl.isPrimaryContact && <Badge>Contact principal</Badge>}
                      {gl.isEmergencyContact && <Badge variant="destructive">Urgence</Badge>}
                    </div>
                    {(gl.guardian.professionDomain || gl.guardian.profession) && (
                      <p className="text-sm text-muted-foreground">
                        {gl.guardian.professionDomain && <span>{gl.guardian.professionDomain}</span>}
                        {gl.guardian.professionDomain && gl.guardian.profession && ' · '}
                        {gl.guardian.profession && <span>{gl.guardian.profession}</span>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(gl)}>
                    <Pencil className="h-4 w-4" />
                  </Button></Tip>
                  <Tip content="Retirer le lien"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUnlinking(gl)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button></Tip>
                </div>
              </div>
            </CardHeader>
            {/* Contact blocks: phones + emails side by side on wider screens. */}
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
              {/* Phones */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Phone className="h-3.5 w-3.5" />Téléphones</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setPhoneForm({ countryCode: defaultCountryCode ?? '+961', number: '', type: 'Mobile', isPrimary: false }); setPhoneDialog(gl.guardianId) }}>
                    <Plus className="mr-1 h-3 w-3" />Ajouter
                  </Button>
                </div>
                {gl.guardian.phones.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucun téléphone</p>
                ) : (
                  <div className="space-y-1.5">
                    {gl.guardian.phones.map(p => (
                      <div key={p.id} className="group flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{p.countryCode} {p.number}</span>
                        <span className="text-xs text-muted-foreground">{p.type}</span>
                        {p.isPrimary && <Badge variant="outline" className="h-5 text-xs">Principal</Badge>}
                        <Tip content="Supprimer"><Button variant="ghost" size="icon" className="ml-auto h-7 w-7 opacity-60 transition-opacity group-hover:opacity-100" disabled={deletePhoneMutation.isPending} onClick={() => deletePhoneMutation.mutateAsync(p.id).then(() => toast.success('Téléphone supprimé')).catch(err => toast.error(parseApiError(err)))}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button></Tip>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Emails */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Mail className="h-3.5 w-3.5" />Courriels</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEmailForm({ address: '', type: 'Personnel', isPrimary: false }); setEmailDialog(gl.guardianId) }}>
                    <Plus className="mr-1 h-3 w-3" />Ajouter
                  </Button>
                </div>
                {gl.guardian.emails.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Aucun courriel</p>
                ) : (
                  <div className="space-y-1.5">
                    {gl.guardian.emails.map(em => (
                      <div key={em.id} className="group flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{em.address}</span>
                        <span className="text-xs text-muted-foreground">{em.type}</span>
                        {em.isPrimary && <Badge variant="outline" className="h-5 text-xs">Principal</Badge>}
                        <Tip content="Supprimer"><Button variant="ghost" size="icon" className="ml-auto h-7 w-7 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" disabled={deleteEmailMutation.isPending} onClick={() => deleteEmailMutation.mutateAsync(em.id).then(() => toast.success('Courriel supprimé')).catch(err => toast.error(parseApiError(err)))}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button></Tip>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Add Guardian Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ajouter un parent ou tuteur</DialogTitle></DialogHeader>
          {/* The search/link-existing mode is leader-only; a member (selfService) only creates new. */}
          {!selfService && (
            <div className="flex gap-2 mb-4">
              <Button variant={mode === 'search' ? 'default' : 'outline'} size="sm" onClick={() => setMode('search')}>
                <Search className="mr-1 h-3 w-3" />Rechercher
              </Button>
              <Button variant={mode === 'create' ? 'default' : 'outline'} size="sm" onClick={() => setMode('create')}>
                <UserPlus className="mr-1 h-3 w-3" />Nouveau
              </Button>
            </div>
          )}

          {mode === 'search' && !selfService ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <RequiredLabel>Rechercher un parent existant</RequiredLabel>
                <Input placeholder="Tapez un nom..." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
              </div>
              {searchResults && searchResults.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-auto">
                  {searchResults.map(g => (
                    <div key={g.id} className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50 cursor-pointer" onClick={() => selectExisting(g)}>
                      <div>
                        <span className="font-medium">{g.firstName} {g.lastName}</span>
                        {g.profession && <span className="text-sm text-muted-foreground ml-2">{g.profession}</span>}
                      </div>
                      {linkForm.guardianId === g.id ? (
                        <div className="flex items-center gap-2">
                          <Select value={linkForm.relationshipType} onValueChange={(v) => setLinkForm(f => ({ ...f, relationshipType: v }))}>
                            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>{RELATIONSHIP_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                          </Select>
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); handleLink(g.id) }} disabled={linkMutation.isPending}>
                            <Link className="mr-1 h-3 w-3" />Lier
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">Cliquer pour sélectionner</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {debouncedSearch.length >= 2 && (!searchResults || searchResults.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Aucun parent trouvé. <button type="button" className="text-primary underline" onClick={() => { setMode('create'); setForm(f => ({ ...f, lastName: searchText })) }}>Créer un nouveau</button>
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <FormFieldErrors show={hasErrors} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <RequiredLabel required>Prénom</RequiredLabel>
                  <Input className={fieldClass('firstName')} value={form.firstName} onChange={(e) => { setForm(f => ({ ...f, firstName: e.target.value })); clearField('firstName') }} required />
                </div>
                <div className="space-y-2">
                  <RequiredLabel required>Nom</RequiredLabel>
                  {/* Family name is force-uppercased on input (matches the member-form convention). */}
                  <Input className={fieldClass('lastName')} value={form.lastName} onChange={(e) => { setForm(f => ({ ...f, lastName: e.target.value.toUpperCase() })); clearField('lastName') }} required />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <RequiredLabel required>Relation</RequiredLabel>
                  <Select value={form.relationshipType} onValueChange={(v) => { setForm(f => ({ ...f, relationshipType: v })); clearField('relationshipType') }}>
                    <SelectTrigger className={fieldClass('relationshipType')}><SelectValue /></SelectTrigger>
                    <SelectContent>{RELATIONSHIP_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Domaine</RequiredLabel>
                  <SearchableSelect
                    value={form.professionDomain}
                    onValueChange={(v) => setForm(f => ({ ...f, professionDomain: v }))}
                    options={domainOptions}
                    placeholder="Domaine d'activité..."
                    searchPlaceholder="Rechercher un domaine..."
                  />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Profession (texte libre)</RequiredLabel>
                  <SearchableSelect
                    value={form.profession}
                    onValueChange={(v) => setForm(f => ({ ...f, profession: v }))}
                    options={PROFESSION_OPTIONS}
                    searchPlaceholder="Rechercher une profession..."
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDeceased} onChange={(e) => setForm(f => ({ ...f, isDeceased: e.target.checked }))} />Décédé(e)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPrimaryContact} onChange={(e) => setForm(f => ({ ...f, isPrimaryContact: e.target.checked }))} />Contact principal</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isEmergencyContact} onChange={(e) => setForm(f => ({ ...f, isEmergencyContact: e.target.checked }))} />Urgence</label>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setAddDialogOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Enregistrement...' : (selfService ? 'Ajouter' : 'Créer et lier')}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add phone dialog */}
      <Dialog open={!!phoneDialog} onOpenChange={() => setPhoneDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un téléphone</DialogTitle></DialogHeader>
          <form onSubmit={handleAddPhone} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <RequiredLabel required>Indicatif</RequiredLabel>
                <SearchableSelect
                  value={phoneForm.countryCode}
                  onValueChange={(v) => setPhoneForm(f => ({ ...f, countryCode: v }))}
                  options={PHONE_COUNTRY_CODES}
                  placeholder="Code pays"
                  searchPlaceholder="Rechercher un indicatif..."
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <RequiredLabel required>Numéro</RequiredLabel>
                <Input value={phoneForm.number} onChange={(e) => setPhoneForm(f => ({ ...f, number: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Type</RequiredLabel>
              <Select value={phoneForm.type} onValueChange={(v) => setPhoneForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PHONE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={phoneForm.isPrimary} onChange={(e) => setPhoneForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setPhoneDialog(null)}>Annuler</Button>
              <Button type="submit" disabled={addPhoneMutation.isPending}>Ajouter</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add email dialog */}
      <Dialog open={!!emailDialog} onOpenChange={() => setEmailDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un courriel</DialogTitle></DialogHeader>
          <form onSubmit={handleAddEmail} className="space-y-4">
            <div className="space-y-2">
              <RequiredLabel required>Adresse courriel</RequiredLabel>
              <Input type="email" value={emailForm.address} onChange={(e) => setEmailForm(f => ({ ...f, address: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Type</RequiredLabel>
              <Select value={emailForm.type} onValueChange={(v) => setEmailForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EMAIL_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailForm.isPrimary} onChange={(e) => setEmailForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEmailDialog(null)}>Annuler</Button>
              <Button type="submit" disabled={addEmailMutation.isPending}>Ajouter</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Guardian Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Modifier le parent</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel required>Prénom</RequiredLabel>
                <Input value={editForm.firstName} onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Nom</RequiredLabel>
                <Input value={editForm.lastName} onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value.toUpperCase() }))} required />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <RequiredLabel>Relation</RequiredLabel>
                <Select value={editForm.relationshipType} onValueChange={(v) => setEditForm(f => ({ ...f, relationshipType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RELATIONSHIP_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <RequiredLabel>Domaine</RequiredLabel>
                <SearchableSelect
                  value={editForm.professionDomain}
                  onValueChange={(v) => setEditForm(f => ({ ...f, professionDomain: v }))}
                  options={domainOptions}
                  placeholder="Domaine d'activité..."
                  searchPlaceholder="Rechercher un domaine..."
                />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Profession (texte libre)</RequiredLabel>
                <SearchableSelect
                  value={editForm.profession}
                  onValueChange={(v) => setEditForm(f => ({ ...f, profession: v }))}
                  options={PROFESSION_OPTIONS}
                  searchPlaceholder="Rechercher une profession..."
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.isDeceased} onChange={(e) => setEditForm(f => ({ ...f, isDeceased: e.target.checked }))} />Décédé(e)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.isPrimaryContact} onChange={(e) => setEditForm(f => ({ ...f, isPrimaryContact: e.target.checked }))} />Contact principal</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.isEmergencyContact} onChange={(e) => setEditForm(f => ({ ...f, isEmergencyContact: e.target.checked }))} />Urgence</label>
            </div>
            <div className="space-y-2">
              <RequiredLabel>Notes</RequiredLabel>
              <textarea className="flex min-h-14 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editForm.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={updateMutation.isPending || updateLinkMutation.isPending}>{updateMutation.isPending || updateLinkMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!unlinking}
        onOpenChange={() => setUnlinking(null)}
        title="Retirer le lien"
        description={`Retirer ${unlinking?.guardian.firstName} ${unlinking?.guardian.lastName} de la famille de ce membre ?`}
        confirmLabel="Retirer"
        variant="destructive"
        loading={unlinkMutation.isPending}
        onConfirm={handleUnlink}
      />
    </div>
  )
}
