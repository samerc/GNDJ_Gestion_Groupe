import { useAuthStore } from '@/stores/auth-store'
import { useMember, type MemberFormData, type MemberPhoneDto, type MemberEmailDto, type MemberAddressDto } from '@/services/member-service'
import { useUpdateMyProfile, useAddMyPhone, useUpdateMyPhone, useDeleteMyPhone, useAddMyEmail, useUpdateMyEmail, useDeleteMyEmail, useAddMyAddress, useUpdateMyAddress, useDeleteMyAddress } from '@/services/my-profile-service'
import { MemberPhoto } from '@/components/shared/member-photo'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RequiredLabel } from '@/components/shared/required-label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { CitySelect } from '@/components/shared/city-select'
import { MemberAssignments } from '@/components/members/member-assignments'
import { MemberGuardians } from '@/components/members/member-guardians'
import { DocumentsCta } from '@/components/members/documents-cta'
import { MemberProgression } from '@/components/members/member-progression'
import { MemberCustomFields } from '@/components/members/member-custom-fields'
import { useSettingArray, useSettingValue, useCities } from '@/services/settings-service'
import { parseApiError } from '@/lib/error-utils'
import { BLOOD_TYPE_OPTIONS, NATIONALITY_OPTIONS, PHONE_TYPE_OPTIONS, PHONE_COUNTRY_CODES, EMAIL_TYPE_OPTIONS, ADDRESS_TYPE_OPTIONS, COUNTRY_OPTIONS } from '@/lib/options'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { PERMISSIONS } from '@/lib/constants'
import { Tip } from '@/components/ui/tooltip'
import { Save, Phone, Mail, MapPin, Plus, Trash2, Pencil } from 'lucide-react'
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
  // groupe sanguin + médical — no approval.
  const updateMutation = useUpdateMyProfile(memberId)
  const pinnedNationalities = useSettingArray('pinned_nationalities')
  const defaultCountryCode = useSettingValue('default_country_code')
  const defaultCountry = useSettingValue('default_country')
  const schools = useSettingArray('member.schools')
  const classes = useSettingArray('member.classes')
  const cities = useCities()

  // Coordonnées use the SELF-SERVICE hooks (own record, no members.edit needed).
  const addPhoneMutation = useAddMyPhone(memberId)
  const deletePhoneMutation = useDeleteMyPhone(memberId)
  const addEmailMutation = useAddMyEmail(memberId)
  const deleteEmailMutation = useDeleteMyEmail(memberId)
  const addAddressMutation = useAddMyAddress(memberId)
  const deleteAddressMutation = useDeleteMyAddress(memberId)
  const updatePhoneMutation = useUpdateMyPhone(memberId)
  const updateEmailMutation = useUpdateMyEmail(memberId)
  const updateAddressMutation = useUpdateMyAddress(memberId)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<MemberFormData>({ firstName: '', lastName: '' })
  const [error, setError] = useState('')

  useUnsavedChanges(editing)

  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [deletingContact, setDeletingContact] = useState<{ type: 'phone' | 'email' | 'address'; id: string; label: string } | null>(null)

  const [phoneForm, setPhoneForm] = useState({ countryCode: '+961', number: '', type: 'Mobile', isPrimary: false, isEmergency: false })
  const [emailForm, setEmailForm] = useState({ address: '', type: 'Personnel', isPrimary: false, isEmergency: false })
  const [addressForm, setAddressForm] = useState({ type: 'Domicile', country: 'Liban', city: '', details: '', isPrimary: false })

  // Contact editing state
  const [editingPhone, setEditingPhone] = useState<MemberPhoneDto | null>(null)
  const [editPhoneForm, setEditPhoneForm] = useState({ countryCode: '', number: '', type: '', isPrimary: false, isEmergency: false })
  const [editingEmail, setEditingEmail] = useState<MemberEmailDto | null>(null)
  const [editEmailForm, setEditEmailForm] = useState({ address: '', type: '', isPrimary: false, isEmergency: false })
  const [editingAddress, setEditingAddress] = useState<MemberAddressDto | null>(null)
  const [editAddressForm, setEditAddressForm] = useState({ type: '', country: '', city: '', details: '', isPrimary: false })

  const openEditPhone = (p: MemberPhoneDto) => {
    setEditPhoneForm({ countryCode: p.countryCode, number: p.number, type: p.type, isPrimary: p.isPrimary, isEmergency: p.isEmergency })
    setEditingPhone(p)
  }
  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPhone) return
    try {
      await updatePhoneMutation.mutateAsync({ id: editingPhone.id, ...editPhoneForm })
      toast.success('Téléphone modifié')
      setEditingPhone(null)
    } catch (err) { setError(parseApiError(err)) }
  }

  const openEditEmail = (em: MemberEmailDto) => {
    setEditEmailForm({ address: em.address, type: em.type, isPrimary: em.isPrimary, isEmergency: em.isEmergency })
    setEditingEmail(em)
  }
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEmail) return
    try {
      await updateEmailMutation.mutateAsync({ id: editingEmail.id, ...editEmailForm })
      toast.success('Courriel modifié')
      setEditingEmail(null)
    } catch (err) { setError(parseApiError(err)) }
  }

  const openEditAddress = (a: MemberAddressDto) => {
    setEditAddressForm({ type: a.type, country: a.country, city: a.city, details: a.details ?? '', isPrimary: a.isPrimary })
    setEditingAddress(a)
  }
  const handleUpdateAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAddress) return
    try {
      await updateAddressMutation.mutateAsync({ id: editingAddress.id, ...editAddressForm, details: editAddressForm.details || null })
      toast.success('Adresse modifiée')
      setEditingAddress(null)
    } catch (err) { setError(parseApiError(err)) }
  }

  const startEdit = () => {
    if (!member) return
    setForm({
      firstName: member.firstName, lastName: member.lastName,
      dateOfBirth: member.dateOfBirth ?? '', gender: member.gender ?? '',
      cardNumber: member.cardNumber ?? '', externalCardNumber: member.externalCardNumber ?? '',
      bloodType: member.bloodType ?? '',
      nationality: member.nationality ?? '', school: member.school ?? '',
      classe: member.classe ?? '', section: member.section ?? '',
      medicalNotes: member.medicalNotes ?? '', allergies: member.allergies ?? '',
      notes: member.notes ?? '',
    })
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
        classe: form.classe || null,
        section: form.section || null,
        bloodType: form.bloodType || null,
        allergies: form.allergies || null,
        medicalNotes: form.medicalNotes || null,
      })
      toast.success('Fiche mise à jour')
      setEditing(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  // Add-contact submits: surface failures (toast over the modal) and keep the dialog open with the typed
  // data so nothing is lost; the mutation's isPending gates the button against a double-tap.
  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await addPhoneMutation.mutateAsync(phoneForm); toast.success('Téléphone ajouté'); setPhoneDialogOpen(false) }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await addEmailMutation.mutateAsync(emailForm); toast.success('Courriel ajouté'); setEmailDialogOpen(false) }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await addAddressMutation.mutateAsync({ ...addressForm, details: addressForm.details || null }); toast.success('Adresse ajoutée'); setAddressDialogOpen(false) }
    catch (err) { toast.error(parseApiError(err)) }
  }

  const handleDeleteContact = async () => {
    if (!deletingContact) return
    try {
      if (deletingContact.type === 'phone') await deletePhoneMutation.mutateAsync(deletingContact.id)
      else if (deletingContact.type === 'email') await deleteEmailMutation.mutateAsync(deletingContact.id)
      else await deleteAddressMutation.mutateAsync(deletingContact.id)
      toast.success('Supprimé')
      setDeletingContact(null)
    } catch (err) { toast.error(parseApiError(err)) }
  }

  if (isLoading || !member) return <LoadingSpinner variant="profile" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <MemberPhoto
            memberId={memberId}
            name={`${member.firstName} ${member.lastName}`}
            photoPath={member.photoPath}
            size={56}
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Ma fiche</h1>
            {/* Synthetic login (prenom.nom@scouts.gndj) can be long — truncate so it never overflows on mobile. */}
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        {/* The Modifier button edits the Profil + Médical fields, so only show it on those tabs.
            Other tabs (Contact, Famille, Documents…) have their own inline add/edit actions. */}
        {(activeTab === 'profile' || activeTab === 'medical') && (
          !editing ? (
            <Button onClick={startEdit}>Modifier</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />{updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          )
        )}
      </div>

      {/* Members mostly log in to upload documents — surface their dossier + completion right on Ma fiche. */}
      <DocumentsCta memberId={memberId} />

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v !== 'profile' && v !== 'medical') setEditing(false) }}>
        <TabsList className="overflow-x-auto flex-nowrap">
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="contact">Contact ({member.phones.length + member.emails.length + member.addresses.length})</TabsTrigger>
          <TabsTrigger value="assignments">Unités / Fonctions</TabsTrigger>
          <TabsTrigger value="famille">Famille</TabsTrigger>
          <TabsTrigger value="medical">Médical &amp; infos</TabsTrigger>
          <TabsTrigger value="progression">Progression</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Informations personnelles</CardTitle></CardHeader>
            <CardContent>
              {editing ? (
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
                            <Input value={form.school || ''} onChange={(e) => setForm(f => ({ ...f, school: e.target.value }))} placeholder="Nom de l'école..." />
                          )}
                        </>
                      )
                    })()}
                  </div>
                  <div className="space-y-2">
                    <RequiredLabel required>Classe</RequiredLabel>
                    <Select value={form.classe || ''} onValueChange={(v) => setForm(f => ({ ...f, classe: v }))}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                      <SelectContent>
                        {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <RequiredLabel>Section</RequiredLabel>
                    <Input value={form.section || ''} onChange={(e) => setForm(f => ({ ...f, section: e.target.value.slice(0, 5) }))} placeholder="Ex: SV, SE..." maxLength={5} />
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
                  <Field label="École" value={member.school} />
                  <Field label="Classe" value={member.classe} />
                  <Field label="Section" value={member.section} />
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4">
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><Phone className="h-4 w-4" />Téléphones</CardTitle><Button size="sm" onClick={() => { setPhoneForm(f => ({ ...f, countryCode: defaultCountryCode ?? '+961' })); setPhoneDialogOpen(true) }}><Plus className="mr-1 h-3 w-3" />Ajouter</Button></div></CardHeader>
            <CardContent>{member.phones.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : <div className="space-y-2">{member.phones.map(p => (<div key={p.id} className="flex items-center gap-3 rounded-md border p-3"><div className="flex-1"><span className="font-medium">{p.countryCode} {p.number}</span><span className="ml-2 text-sm text-muted-foreground">{p.type}</span></div><div className="flex items-center gap-1">{p.isPrimary && <Badge>Principal</Badge>}{p.isEmergency && <Badge variant="destructive">Urgence</Badge>}<Tip content="Modifier"><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEditPhone(p)}><Pencil className="h-3.5 w-3.5" /></Button></Tip><Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setDeletingContact({ type: 'phone', id: p.id, label: `${p.countryCode} ${p.number}` })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></Tip></div></div>))}</div>}</CardContent>
          </Card>
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" />Courriels</CardTitle><Button size="sm" onClick={() => setEmailDialogOpen(true)}><Plus className="mr-1 h-3 w-3" />Ajouter</Button></div></CardHeader>
            <CardContent>{member.emails.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : <div className="space-y-2">{member.emails.map(e => (<div key={e.id} className="flex items-center gap-3 rounded-md border p-3"><div className="flex-1"><span className="font-medium">{e.address}</span><span className="ml-2 text-sm text-muted-foreground">{e.type}</span></div><div className="flex items-center gap-1">{e.isPrimary && <Badge>Principal</Badge>}<Tip content="Modifier"><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEditEmail(e)}><Pencil className="h-3.5 w-3.5" /></Button></Tip><Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setDeletingContact({ type: 'email', id: e.id, label: e.address })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></Tip></div></div>))}</div>}</CardContent>
          </Card>
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" />Adresses</CardTitle><Button size="sm" onClick={() => { setAddressForm(f => ({ ...f, country: defaultCountry ?? 'Liban' })); setAddressDialogOpen(true) }}><Plus className="mr-1 h-3 w-3" />Ajouter</Button></div></CardHeader>
            <CardContent>{member.addresses.length === 0 ? <p className="text-sm text-muted-foreground">Aucune</p> : <div className="space-y-2">{member.addresses.map(a => (<div key={a.id} className="flex items-center gap-3 rounded-md border p-3"><div className="flex-1"><span className="font-medium">{a.city}, {a.country}</span>{a.details && <p className="text-sm text-muted-foreground">{a.details}</p>}</div><div className="flex items-center gap-1">{a.isPrimary && <Badge>Principal</Badge>}<Tip content="Modifier"><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEditAddress(a)}><Pencil className="h-3.5 w-3.5" /></Button></Tip><Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setDeletingContact({ type: 'address', id: a.id, label: `${a.city}` })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></Tip></div></div>))}</div>}</CardContent>
          </Card>
        </TabsContent>

        {/* A regular member can't edit their own assignments (leaders assign them); a leader
            (assignments.create) can manage them from here too. */}
        <TabsContent value="assignments"><MemberAssignments memberId={memberId} memberName={`${member.firstName} ${member.lastName}`} readOnly={!canManageOwnAssignments} selfPropose /></TabsContent>
        <TabsContent value="famille"><MemberGuardians memberId={memberId} selfService /></TabsContent>

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
          <MemberCustomFields memberId={memberId} />
        </TabsContent>
      </Tabs>

      {/* Phone/Email/Address add dialogs — same as member detail */}
      <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un téléphone</DialogTitle></DialogHeader>
          <form onSubmit={handleAddPhone} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2"><RequiredLabel required>Indicatif</RequiredLabel><SearchableSelect value={phoneForm.countryCode} onValueChange={(v) => setPhoneForm(f => ({ ...f, countryCode: v }))} options={PHONE_COUNTRY_CODES} placeholder="Code pays" searchPlaceholder="Rechercher un indicatif..." /></div>
              <div className="sm:col-span-2 space-y-2"><RequiredLabel required>Numéro</RequiredLabel><Input value={phoneForm.number} onChange={(e) => setPhoneForm(f => ({ ...f, number: e.target.value }))} required /></div>
            </div>
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={phoneForm.type} onValueChange={(v) => setPhoneForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PHONE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={phoneForm.isPrimary} onChange={(e) => setPhoneForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={phoneForm.isEmergency} onChange={(e) => setPhoneForm(f => ({ ...f, isEmergency: e.target.checked }))} />Urgence</label></div>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setPhoneDialogOpen(false)}>Annuler</Button><Button type="submit" disabled={addPhoneMutation.isPending}>{addPhoneMutation.isPending ? 'Ajout...' : 'Ajouter'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un courriel</DialogTitle></DialogHeader>
          <form onSubmit={handleAddEmail} className="space-y-4">
            <div className="space-y-2"><RequiredLabel required>Adresse</RequiredLabel><Input type="email" value={emailForm.address} onChange={(e) => setEmailForm(f => ({ ...f, address: e.target.value }))} required /></div>
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={emailForm.type} onValueChange={(v) => setEmailForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EMAIL_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setEmailDialogOpen(false)}>Annuler</Button><Button type="submit" disabled={addEmailMutation.isPending}>{addEmailMutation.isPending ? 'Ajout...' : 'Ajouter'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter une adresse</DialogTitle></DialogHeader>
          <form onSubmit={handleAddAddress} className="space-y-4">
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={addressForm.type} onValueChange={(v) => setAddressForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ADDRESS_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><RequiredLabel required>Pays</RequiredLabel><Select value={addressForm.country} onValueChange={(v) => setAddressForm(f => ({ ...f, country: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COUNTRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><RequiredLabel required>Ville</RequiredLabel><CitySelect value={addressForm.city} onChange={(city) => setAddressForm(f => ({ ...f, city }))} cities={cities} /></div></div>
            <div className="space-y-2"><RequiredLabel>Détails</RequiredLabel><Input value={addressForm.details} onChange={(e) => setAddressForm(f => ({ ...f, details: e.target.value }))} placeholder="Rue, immeuble..." /></div>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setAddressDialogOpen(false)}>Annuler</Button><Button type="submit" disabled={addAddressMutation.isPending}>{addAddressMutation.isPending ? 'Ajout...' : 'Ajouter'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Edit phone dialog */}
      <Dialog open={!!editingPhone} onOpenChange={() => setEditingPhone(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le téléphone</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdatePhone} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2"><RequiredLabel required>Indicatif</RequiredLabel><SearchableSelect value={editPhoneForm.countryCode} onValueChange={(v) => setEditPhoneForm(f => ({ ...f, countryCode: v }))} options={PHONE_COUNTRY_CODES} placeholder="Code pays" searchPlaceholder="Rechercher un indicatif..." /></div>
              <div className="sm:col-span-2 space-y-2"><RequiredLabel required>Numéro</RequiredLabel><Input value={editPhoneForm.number} onChange={(e) => setEditPhoneForm(f => ({ ...f, number: e.target.value }))} required /></div>
            </div>
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={editPhoneForm.type} onValueChange={(v) => setEditPhoneForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PHONE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editPhoneForm.isPrimary} onChange={(e) => setEditPhoneForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editPhoneForm.isEmergency} onChange={(e) => setEditPhoneForm(f => ({ ...f, isEmergency: e.target.checked }))} />Urgence</label></div>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setEditingPhone(null)}>Annuler</Button><Button type="submit" disabled={updatePhoneMutation.isPending}>Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit email dialog */}
      <Dialog open={!!editingEmail} onOpenChange={() => setEditingEmail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le courriel</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdateEmail} className="space-y-4">
            <div className="space-y-2"><RequiredLabel required>Adresse</RequiredLabel><Input type="email" value={editEmailForm.address} onChange={(e) => setEditEmailForm(f => ({ ...f, address: e.target.value }))} required /></div>
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={editEmailForm.type} onValueChange={(v) => setEditEmailForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EMAIL_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editEmailForm.isPrimary} onChange={(e) => setEditEmailForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editEmailForm.isEmergency} onChange={(e) => setEditEmailForm(f => ({ ...f, isEmergency: e.target.checked }))} />Urgence</label></div>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setEditingEmail(null)}>Annuler</Button><Button type="submit" disabled={updateEmailMutation.isPending}>Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit address dialog */}
      <Dialog open={!!editingAddress} onOpenChange={() => setEditingAddress(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'adresse</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdateAddress} className="space-y-4">
            <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={editAddressForm.type} onValueChange={(v) => setEditAddressForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ADDRESS_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="space-y-2"><RequiredLabel required>Pays</RequiredLabel><Select value={editAddressForm.country} onValueChange={(v) => setEditAddressForm(f => ({ ...f, country: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COUNTRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><RequiredLabel required>Ville</RequiredLabel><CitySelect value={editAddressForm.city} onChange={(city) => setEditAddressForm(f => ({ ...f, city }))} cities={cities} /></div></div>
            <div className="space-y-2"><RequiredLabel>Détails</RequiredLabel><Input value={editAddressForm.details} onChange={(e) => setEditAddressForm(f => ({ ...f, details: e.target.value }))} placeholder="Rue, immeuble..." /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editAddressForm.isPrimary} onChange={(e) => setEditAddressForm(f => ({ ...f, isPrimary: e.target.checked }))} />Principal</label>
            <DialogFooter><Button variant="outline" type="button" onClick={() => setEditingAddress(null)}>Annuler</Button><Button type="submit" disabled={updateAddressMutation.isPending}>Enregistrer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deletingContact} onOpenChange={() => setDeletingContact(null)} title="Supprimer" description={`Supprimer « ${deletingContact?.label} » ?`} confirmLabel="Supprimer" variant="destructive" loading={deletePhoneMutation.isPending || deleteEmailMutation.isPending || deleteAddressMutation.isPending} onConfirm={handleDeleteContact} />

    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{value || '—'}</dd></div>
}
