import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import { useFormValidation } from '@/hooks/use-form-validation'
import { FormFieldErrors } from '@/components/shared/form-field-errors'
import { useDebounce } from '@/hooks/use-debounce'
import { useMemberGuardians, useSearchGuardians, useCreateGuardian, useUpdateGuardian, useUpdateGuardianLink, useLinkGuardian, useUnlinkGuardian, useAddGuardianPhone, useAddGuardianEmail, useDeleteGuardianPhone, useDeleteGuardianEmail, type GuardianLinkDto, type GuardianSearchDto } from '@/services/guardian-service'
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
import { Plus, Pencil, Trash2, Phone, Mail, Users2, Search, UserPlus, Link } from 'lucide-react'

const RELATIONSHIP_OPTIONS = [
  { value: 'Père', label: 'Père' },
  { value: 'Mère', label: 'Mère' },
  { value: 'Tuteur', label: 'Tuteur' },
  { value: 'TuteurLégal', label: 'Tuteur légal' },
  { value: 'Autre', label: 'Autre' },
]

interface MemberGuardiansProps { memberId: string }

export function MemberGuardians({ memberId }: MemberGuardiansProps) {
  const { data: guardians } = useMemberGuardians(memberId)
  const createMutation = useCreateGuardian(memberId)
  const updateMutation = useUpdateGuardian(memberId)
  const updateLinkMutation = useUpdateGuardianLink(memberId)
  const linkMutation = useLinkGuardian(memberId)
  const unlinkMutation = useUnlinkGuardian(memberId)
  const addPhoneMutation = useAddGuardianPhone(memberId)
  const addEmailMutation = useAddGuardianEmail(memberId)
  const deletePhoneMutation = useDeleteGuardianPhone(memberId)
  const deleteEmailMutation = useDeleteGuardianEmail(memberId)
  const defaultCountryCode = useSettingValue('default_country_code')
  const pinnedProfessions = useSettingArray('pinned_professions')

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [searchText, setSearchText] = useState('')
  const debouncedSearch = useDebounce(searchText)
  const { data: searchResults } = useSearchGuardians(debouncedSearch)

  const [form, setForm] = useState({ firstName: '', lastName: '', profession: '', relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false, isDeceased: false })
  const [linkForm, setLinkForm] = useState({ guardianId: '', relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false })
  const [error, setError] = useState('')
  const { validate, clearField, clearAll, fieldClass, hasErrors } = useFormValidation()

  const [phoneDialog, setPhoneDialog] = useState<string | null>(null)
  const [emailDialog, setEmailDialog] = useState<string | null>(null)
  const [phoneForm, setPhoneForm] = useState({ countryCode: '+961', number: '', type: 'Mobile', isPrimary: false })
  const [emailForm, setEmailForm] = useState({ address: '', type: 'Personnel', isPrimary: false })
  const [unlinking, setUnlinking] = useState<GuardianLinkDto | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({ id: '', firstName: '', lastName: '', profession: '', isDeceased: false, notes: '', linkId: '', relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false })

  const openEdit = (gl: GuardianLinkDto) => {
    setEditForm({
      id: gl.guardianId, firstName: gl.guardian.firstName, lastName: gl.guardian.lastName,
      profession: gl.guardian.profession ?? '', isDeceased: gl.guardian.isDeceased, notes: gl.guardian.notes ?? '',
      linkId: gl.linkId, relationshipType: gl.relationshipType, isPrimaryContact: gl.isPrimaryContact, isEmergencyContact: gl.isEmergencyContact,
    })
    setError('')
    setEditDialogOpen(true)
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await updateMutation.mutateAsync({ id: editForm.id, firstName: editForm.firstName, lastName: editForm.lastName, profession: editForm.profession || null, isDeceased: editForm.isDeceased, notes: editForm.notes || null })
      await updateLinkMutation.mutateAsync({ linkId: editForm.linkId, relationshipType: editForm.relationshipType, isPrimaryContact: editForm.isPrimaryContact, isEmergencyContact: editForm.isEmergencyContact })
      setEditDialogOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const openAdd = () => {
    setMode('search')
    setSearchText('')
    setForm({ firstName: '', lastName: '', profession: '', relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false, isDeceased: false })
    setError(''); clearAll()
    setAddDialogOpen(true)
  }

  const selectExisting = (g: GuardianSearchDto) => {
    setLinkForm({ guardianId: g.id, relationshipType: 'Père', isPrimaryContact: false, isEmergencyContact: false })
    setMode('search')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate({ firstName: !form.firstName, lastName: !form.lastName, relationshipType: !form.relationshipType })) return
    try {
      await createMutation.mutateAsync({ ...form, profession: form.profession || null })
      setAddDialogOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleLink = async (guardianId: string) => {
    setError('')
    try {
      await linkMutation.mutateAsync({ ...linkForm, guardianId })
      setAddDialogOpen(false)
    } catch (err) { setError(parseApiError(err)) }
  }

  const handleUnlink = async () => {
    if (!unlinking) return
    try { await unlinkMutation.mutateAsync(unlinking.linkId); setUnlinking(null) } catch { setUnlinking(null) }
  }

  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneDialog) return
    await addPhoneMutation.mutateAsync({ guardianId: phoneDialog, ...phoneForm })
    setPhoneDialog(null)
    setPhoneForm({ countryCode: defaultCountryCode ?? '+961', number: '', type: 'Mobile', isPrimary: false })
  }

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailDialog) return
    await addEmailMutation.mutateAsync({ guardianId: emailDialog, ...emailForm })
    setEmailDialog(null)
    setEmailForm({ address: '', type: 'Personnel', isPrimary: false })
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
          <Card key={gl.linkId}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users2 className="h-4 w-4" />
                  <CardTitle className="text-base">{gl.guardian.firstName} {gl.guardian.lastName}</CardTitle>
                  <Badge variant="outline">{RELATIONSHIP_OPTIONS.find(r => r.value === gl.relationshipType)?.label ?? gl.relationshipType}</Badge>
                  {gl.guardian.isDeceased && <Badge variant="secondary">Décédé(e)</Badge>}
                  {gl.isPrimaryContact && <Badge>Contact principal</Badge>}
                  {gl.isEmergencyContact && <Badge variant="destructive">Urgence</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(gl)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUnlinking(gl)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              {gl.guardian.profession && <p className="text-sm text-muted-foreground">Profession: {gl.guardian.profession}</p>}
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Phones */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium flex items-center gap-1"><Phone className="h-3 w-3" />Téléphones</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setPhoneForm({ countryCode: defaultCountryCode ?? '+961', number: '', type: 'Mobile', isPrimary: false }); setPhoneDialog(gl.guardianId) }}>
                    <Plus className="mr-1 h-3 w-3" />Ajouter
                  </Button>
                </div>
                {gl.guardian.phones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun téléphone</p>
                ) : (
                  <div className="space-y-1">
                    {gl.guardian.phones.map(p => (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <span>{p.countryCode} {p.number}</span>
                        <span className="text-muted-foreground text-xs">{p.type}</span>
                        {p.isPrimary && <Badge variant="outline" className="text-xs h-5">Principal</Badge>}
                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => deletePhoneMutation.mutate(p.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Emails */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium flex items-center gap-1"><Mail className="h-3 w-3" />Courriels</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEmailForm({ address: '', type: 'Personnel', isPrimary: false }); setEmailDialog(gl.guardianId) }}>
                    <Plus className="mr-1 h-3 w-3" />Ajouter
                  </Button>
                </div>
                {gl.guardian.emails.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun courriel</p>
                ) : (
                  <div className="space-y-1">
                    {gl.guardian.emails.map(em => (
                      <div key={em.id} className="flex items-center gap-2 text-sm">
                        <span>{em.address}</span>
                        <span className="text-muted-foreground text-xs">{em.type}</span>
                        {em.isPrimary && <Badge variant="outline" className="text-xs h-5">Principal</Badge>}
                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => deleteEmailMutation.mutate(em.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
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
          <div className="flex gap-2 mb-4">
            <Button variant={mode === 'search' ? 'default' : 'outline'} size="sm" onClick={() => setMode('search')}>
              <Search className="mr-1 h-3 w-3" />Rechercher
            </Button>
            <Button variant={mode === 'create' ? 'default' : 'outline'} size="sm" onClick={() => setMode('create')}>
              <UserPlus className="mr-1 h-3 w-3" />Nouveau
            </Button>
          </div>

          {mode === 'search' ? (
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <RequiredLabel required>Prénom</RequiredLabel>
                  <Input className={fieldClass('firstName')} value={form.firstName} onChange={(e) => { setForm(f => ({ ...f, firstName: e.target.value })); clearField('firstName') }} required />
                </div>
                <div className="space-y-2">
                  <RequiredLabel required>Nom</RequiredLabel>
                  <Input className={fieldClass('lastName')} value={form.lastName} onChange={(e) => { setForm(f => ({ ...f, lastName: e.target.value })); clearField('lastName') }} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <RequiredLabel required>Relation</RequiredLabel>
                  <Select value={form.relationshipType} onValueChange={(v) => { setForm(f => ({ ...f, relationshipType: v })); clearField('relationshipType') }}>
                    <SelectTrigger className={fieldClass('relationshipType')}><SelectValue /></SelectTrigger>
                    <SelectContent>{RELATIONSHIP_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Profession</RequiredLabel>
                  <SearchableSelect
                    value={form.profession}
                    onValueChange={(v) => setForm(f => ({ ...f, profession: v }))}
                    options={PROFESSION_OPTIONS}
                    pinnedValues={pinnedProfessions}
                    searchPlaceholder="Rechercher une profession..."
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDeceased} onChange={(e) => setForm(f => ({ ...f, isDeceased: e.target.checked }))} />Décédé(e)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPrimaryContact} onChange={(e) => setForm(f => ({ ...f, isPrimaryContact: e.target.checked }))} />Contact principal</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isEmergencyContact} onChange={(e) => setForm(f => ({ ...f, isEmergencyContact: e.target.checked }))} />Urgence</label>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setAddDialogOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Création...' : 'Créer et lier'}</Button>
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <RequiredLabel required>Indicatif</RequiredLabel>
                <Select value={phoneForm.countryCode} onValueChange={(v) => setPhoneForm(f => ({ ...f, countryCode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PHONE_COUNTRY_CODES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel required>Prénom</RequiredLabel>
                <Input value={editForm.firstName} onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Nom</RequiredLabel>
                <Input value={editForm.lastName} onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel>Relation</RequiredLabel>
                <Select value={editForm.relationshipType} onValueChange={(v) => setEditForm(f => ({ ...f, relationshipType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RELATIONSHIP_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <RequiredLabel>Profession</RequiredLabel>
                <SearchableSelect
                  value={editForm.profession}
                  onValueChange={(v) => setEditForm(f => ({ ...f, profession: v }))}
                  options={PROFESSION_OPTIONS}
                  pinnedValues={pinnedProfessions}
                  searchPlaceholder="Rechercher une profession..."
                />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.isDeceased} onChange={(e) => setEditForm(f => ({ ...f, isDeceased: e.target.checked }))} />Décédé(e)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.isPrimaryContact} onChange={(e) => setEditForm(f => ({ ...f, isPrimaryContact: e.target.checked }))} />Contact principal</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.isEmergencyContact} onChange={(e) => setEditForm(f => ({ ...f, isEmergencyContact: e.target.checked }))} />Urgence</label>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}</Button>
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
