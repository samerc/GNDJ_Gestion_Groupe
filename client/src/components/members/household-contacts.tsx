// "Coordonnées du foyer" — ALL of a household's phones + emails in one place, pooled from the member AND each
// parent (instead of being split under each parent). Every row is tagged with WHOSE it is (Vous / Père · X /
// Mère · Y) and carries an Urgence badge when that person is an emergency contact (member = per-contact flag,
// parent = the guardian link's contact-d'urgence flag). Add/edit/delete inline; the parents' own section
// (MemberGuardians with hideContacts) then shows only who the people are. Shared by Ma fiche (selfService, own
// endpoints) and the CG/admin member panel (leader endpoints, gated by canEdit).
import { useState } from 'react'
import {
  useMember, useAddPhone, useUpdatePhone, useDeletePhone, useAddEmail, useUpdateEmail, useDeleteEmail,
  useAddAddress, useUpdateAddress, useDeleteAddress, useSetPrimaryContactEmail,
} from '@/services/member-service'
import {
  useAddMyPhone, useUpdateMyPhone, useDeleteMyPhone, useAddMyEmail, useUpdateMyEmail, useDeleteMyEmail,
  useAddMyAddress, useUpdateMyAddress, useDeleteMyAddress, useSetMyPrimaryContactEmail,
} from '@/services/my-profile-service'
import {
  useMemberGuardians, useAddGuardianPhone, useUpdateGuardianPhone, useDeleteGuardianPhone, useAddGuardianEmail,
  useUpdateGuardianEmail, useDeleteGuardianEmail, useUpdateGuardianLink,
  useAddMyGuardianPhone, useUpdateMyGuardianPhone, useDeleteMyGuardianPhone, useAddMyGuardianEmail,
  useUpdateMyGuardianEmail, useDeleteMyGuardianEmail, useUpdateMyGuardianLink,
} from '@/services/guardian-service'
import { useSettingValue, useCities } from '@/services/settings-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { PhoneInput, formatPhoneDisplay } from '@/components/ui/phone-input'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { CitySelect } from '@/components/shared/city-select'
import { CopyButton } from '@/components/shared/copy-button'
import { WhatsappLink } from '@/components/shared/whatsapp-link'
import { RequiredLabel } from '@/components/shared/required-label'
import { Tip } from '@/components/ui/tooltip'
import { PHONE_COUNTRY_CODES, ADDRESS_TYPE_OPTIONS, COUNTRY_OPTIONS, optionsWithCurrent } from '@/lib/options'
import { parseApiError } from '@/lib/error-utils'
import { Phone, Mail, MapPin, Plus, Pencil, Trash2, Star } from 'lucide-react'
import { toast } from 'sonner'

const RELATIONSHIP_OPTIONS = [
  { value: 'Père', label: 'Père' }, { value: 'Mère', label: 'Mère' },
  { value: 'Tuteur', label: 'Tuteur' }, { value: 'TuteurLégal', label: 'Tuteur légal' }, { value: 'Autre', label: 'Autre' },
]
const normRel = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const relLabel = (v: string) => RELATIONSHIP_OPTIONS.find(r => normRel(r.value) === normRel(v))?.label ?? v
const canonicalRel = (v: string) => RELATIONSHIP_OPTIONS.find(r => normRel(r.value) === normRel(v))?.value ?? v

interface Props { memberId: string; selfService?: boolean; canEdit?: boolean }

export function HouseholdContacts({ memberId, selfService, canEdit }: Props) {
  const editable = !!selfService || !!canEdit // a member always edits their own; a leader needs canEdit
  const { data: member } = useMember(memberId)
  const { data: guardians } = useMemberGuardians(memberId)

  // Pick self-service vs leader hooks (call both — mutations don't fetch, so the unused set is free).
  const addPhone = pick(selfService, useAddMyPhone(memberId), useAddPhone(memberId))
  const updPhone = pick(selfService, useUpdateMyPhone(memberId), useUpdatePhone(memberId))
  const delPhone = pick(selfService, useDeleteMyPhone(memberId), useDeletePhone(memberId))
  const addEmail = pick(selfService, useAddMyEmail(memberId), useAddEmail(memberId))
  const updEmail = pick(selfService, useUpdateMyEmail(memberId), useUpdateEmail(memberId))
  const delEmail = pick(selfService, useDeleteMyEmail(memberId), useDeleteEmail(memberId))
  const addAddr = pick(selfService, useAddMyAddress(memberId), useAddAddress(memberId))
  const updAddr = pick(selfService, useUpdateMyAddress(memberId), useUpdateAddress(memberId))
  const delAddr = pick(selfService, useDeleteMyAddress(memberId), useDeleteAddress(memberId))
  const setPrimary = pick(selfService, useSetMyPrimaryContactEmail(memberId), useSetPrimaryContactEmail(memberId))
  const addGPhone = pick(selfService, useAddMyGuardianPhone(memberId), useAddGuardianPhone(memberId))
  const updGPhone = pick(selfService, useUpdateMyGuardianPhone(memberId), useUpdateGuardianPhone(memberId))
  const delGPhone = pick(selfService, useDeleteMyGuardianPhone(memberId), useDeleteGuardianPhone(memberId))
  const addGEmail = pick(selfService, useAddMyGuardianEmail(memberId), useAddGuardianEmail(memberId))
  const updGEmail = pick(selfService, useUpdateMyGuardianEmail(memberId), useUpdateGuardianEmail(memberId))
  const delGEmail = pick(selfService, useDeleteMyGuardianEmail(memberId), useDeleteGuardianEmail(memberId))
  const updGLink = pick(selfService, useUpdateMyGuardianLink(memberId), useUpdateGuardianLink(memberId))

  const defaultCountryCode = useSettingValue('default_country_code')
  const defaultCountry = useSettingValue('default_country')
  const cities = useCities()

  const owners = [{ key: 'self', label: 'Vous' }, ...(guardians ?? []).map(g => ({ key: g.guardianId, label: `${relLabel(g.relationshipType)} · ${g.guardian.firstName}` }))]
  const typeForOwner = (key: string) => key === 'self' ? 'Personnel' : (relLabel(guardians?.find(g => g.guardianId === key)?.relationshipType ?? '') || 'Parent')

  // Add / edit dialog state.
  const [phoneAdd, setPhoneAdd] = useState<{ owner: string; countryCode: string; number: string } | null>(null)
  const [phoneEdit, setPhoneEdit] = useState<{ id: string; owner: string; countryCode: string; number: string; isPrimary: boolean; isEmergency: boolean; linkId: string | null; relationship: string } | null>(null)
  const [emailAdd, setEmailAdd] = useState<{ owner: string; address: string } | null>(null)
  const [emailEdit, setEmailEdit] = useState<{ id: string; owner: string; origAddress: string; address: string; isPrimary: boolean; isEmergency: boolean; linkId: string | null; relationship: string } | null>(null)
  const [addrAdd, setAddrAdd] = useState<{ type: string; country: string; city: string; details: string } | null>(null)
  const [addrEdit, setAddrEdit] = useState<{ id: string; type: string; country: string; city: string; details: string; isPrimary: boolean } | null>(null)
  const [del, setDel] = useState<{ kind: 'phone' | 'email' | 'address'; owner: string; id: string; label: string } | null>(null)

  if (!member || !guardians) return null

  // Pooled rows (member's own + each parent's). Urgence: member = per-contact flag; parent = the link flag.
  const phoneRows = [
    ...member.phones.map(p => ({ owner: 'self', id: p.id, cc: p.countryCode, number: p.number, ownerLabel: 'Vous', urgence: p.isEmergency, isPrimary: p.isPrimary, isEmergency: p.isEmergency, linkId: null as string | null, relationship: '' })),
    ...guardians.flatMap(gl => gl.guardian.phones.map(p => ({ owner: gl.guardianId, id: p.id, cc: p.countryCode, number: p.number, ownerLabel: `${relLabel(gl.relationshipType)} · ${gl.guardian.firstName}`, urgence: gl.isEmergencyContact, isPrimary: p.isPrimary, isEmergency: false, linkId: gl.linkId as string | null, relationship: gl.relationshipType }))),
  ]
  const emailRows = [
    ...member.emails.map(e => ({ owner: 'self', id: e.id, address: e.address, ownerLabel: 'Vous', urgence: e.isEmergency, isEmergency: e.isEmergency, linkId: null as string | null, relationship: '' })),
    ...guardians.flatMap(gl => gl.guardian.emails.map(e => ({ owner: gl.guardianId, id: e.id, address: e.address, ownerLabel: `${relLabel(gl.relationshipType)} · ${gl.guardian.firstName}`, urgence: gl.isEmergencyContact, isEmergency: false, linkId: gl.linkId as string | null, relationship: gl.relationshipType }))),
  ]
  const contactEmailOptions = Array.from(new Set(emailRows.map(r => r.address)))

  // Apply a relationship change to the owning parent's link (fixes the Père/Mère label everywhere).
  const applyRelationship = async (owner: string, linkId: string | null, relationship: string) => {
    if (owner === 'self' || !linkId) return
    const g = guardians.find(x => x.guardianId === owner)
    if (!g || normRel(g.relationshipType) === normRel(relationship)) return
    await updGLink.mutateAsync({ linkId, relationshipType: relationship, isPrimaryContact: g.isPrimaryContact, isEmergencyContact: g.isEmergencyContact })
  }

  const submitAddPhone = async (e: React.FormEvent) => {
    e.preventDefault(); if (!phoneAdd) return
    const type = typeForOwner(phoneAdd.owner)
    try {
      if (phoneAdd.owner === 'self') await addPhone.mutateAsync({ countryCode: phoneAdd.countryCode, number: phoneAdd.number, type, isPrimary: false, isEmergency: false })
      else await addGPhone.mutateAsync({ guardianId: phoneAdd.owner, countryCode: phoneAdd.countryCode, number: phoneAdd.number, type, isPrimary: false })
      setPhoneAdd(null); toast.success('Téléphone ajouté')
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const submitEditPhone = async (e: React.FormEvent) => {
    e.preventDefault(); if (!phoneEdit) return
    try {
      if (phoneEdit.owner === 'self') await updPhone.mutateAsync({ id: phoneEdit.id, countryCode: phoneEdit.countryCode, number: phoneEdit.number, type: 'Personnel', isPrimary: phoneEdit.isPrimary, isEmergency: phoneEdit.isEmergency })
      else await updGPhone.mutateAsync({ id: phoneEdit.id, countryCode: phoneEdit.countryCode, number: phoneEdit.number, type: relLabel(phoneEdit.relationship), isPrimary: phoneEdit.isPrimary })
      await applyRelationship(phoneEdit.owner, phoneEdit.linkId, phoneEdit.relationship)
      setPhoneEdit(null); toast.success('Téléphone modifié')
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const submitAddEmail = async (e: React.FormEvent) => {
    e.preventDefault(); if (!emailAdd) return
    const type = typeForOwner(emailAdd.owner)
    try {
      if (emailAdd.owner === 'self') await addEmail.mutateAsync({ address: emailAdd.address, type, isPrimary: false, isEmergency: false })
      else await addGEmail.mutateAsync({ guardianId: emailAdd.owner, address: emailAdd.address, type, isPrimary: false })
      setEmailAdd(null); toast.success('Courriel ajouté')
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const submitEditEmail = async (e: React.FormEvent) => {
    e.preventDefault(); if (!emailEdit) return
    try {
      if (emailEdit.owner === 'self') await updEmail.mutateAsync({ id: emailEdit.id, address: emailEdit.address, type: 'Personnel', isPrimary: emailEdit.isPrimary, isEmergency: emailEdit.isEmergency })
      else await updGEmail.mutateAsync({ id: emailEdit.id, address: emailEdit.address, type: relLabel(emailEdit.relationship), isPrimary: emailEdit.isPrimary })
      await applyRelationship(emailEdit.owner, emailEdit.linkId, emailEdit.relationship)
      // Keep the "principal" email pointing at the (possibly changed) address.
      if (member.primaryContactEmail && member.primaryContactEmail.toLowerCase() === emailEdit.origAddress.toLowerCase() && emailEdit.address.trim().toLowerCase() !== emailEdit.origAddress.toLowerCase())
        await setPrimary.mutateAsync(emailEdit.address.trim())
      setEmailEdit(null); toast.success('Courriel modifié')
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const submitAddAddr = async (e: React.FormEvent) => {
    e.preventDefault(); if (!addrAdd) return
    try { await addAddr.mutateAsync({ ...addrAdd, details: addrAdd.details || null, isPrimary: false }); setAddrAdd(null); toast.success('Adresse ajoutée') }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const submitEditAddr = async (e: React.FormEvent) => {
    e.preventDefault(); if (!addrEdit) return
    try { await updAddr.mutateAsync({ id: addrEdit.id, type: addrEdit.type, country: addrEdit.country, city: addrEdit.city, details: addrEdit.details || null, isPrimary: addrEdit.isPrimary }); setAddrEdit(null); toast.success('Adresse modifiée') }
    catch (err) { toast.error(parseApiError(err)) }
  }
  const confirmDelete = async () => {
    if (!del) return
    try {
      if (del.kind === 'phone') await (del.owner === 'self' ? delPhone.mutateAsync(del.id) : delGPhone.mutateAsync(del.id))
      else if (del.kind === 'email') await (del.owner === 'self' ? delEmail.mutateAsync(del.id) : delGEmail.mutateAsync(del.id))
      else await delAddr.mutateAsync(del.id)
      setDel(null); toast.success('Supprimé')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Coordonnées du foyer</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {/* Courriel de contact principal — recipient for member-facing mail. */}
        {editable && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium"><Mail className="h-3.5 w-3.5 text-muted-foreground" />Courriel de contact principal</p>
                <p className="text-xs text-muted-foreground">Adresse qui reçoit nos messages (réinitialisation du mot de passe…).</p>
              </div>
              <Select value={member.primaryContactEmail ?? '__auto__'} onValueChange={(v) => setPrimary.mutateAsync(v === '__auto__' ? null : v).then(() => toast.success('Courriel principal mis à jour')).catch(err => toast.error(parseApiError(err)))} disabled={setPrimary.isPending}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Automatique (membre, sinon parent)</SelectItem>
                  {contactEmailOptions.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {contactEmailOptions.length === 0 && <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">Aucune adresse email — ajoutez-en une pour recevoir nos messages.</p>}
          </div>
        )}

        {/* Téléphones (all household) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h5 className="flex items-center gap-1.5 text-sm font-semibold"><Phone className="h-4 w-4 text-muted-foreground" />Téléphones</h5>
            {editable && <Button size="sm" variant="outline" onClick={() => setPhoneAdd({ owner: owners[0].key, countryCode: defaultCountryCode ?? '+961', number: '' })}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>}
          </div>
          {phoneRows.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : (
            <div className="space-y-1.5">{phoneRows.map(r => (
              <div key={`${r.owner}:${r.id}`} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{formatPhoneDisplay(r.cc, r.number)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{r.ownerLabel}</span>
                </div>
                {r.isPrimary && <Badge variant="outline" className="h-5 shrink-0 text-[10px]">Principal</Badge>}
                {r.urgence && <Badge variant="destructive" className="h-5 shrink-0 text-[10px]">Urgence</Badge>}
                {!selfService && <CopyButton value={formatPhoneDisplay(r.cc, r.number)} label="Copier le numéro" />}
                {!selfService && <WhatsappLink countryCode={r.cc} number={r.number} />}
                {editable && <>
                  <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:h-7 sm:w-7" onClick={() => setPhoneEdit({ id: r.id, owner: r.owner, countryCode: r.cc, number: r.number, isPrimary: r.isPrimary, isEmergency: r.isEmergency, linkId: r.linkId, relationship: canonicalRel(r.relationship) })}><Pencil className="h-3 w-3" /></Button></Tip>
                  <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:h-7 sm:w-7" onClick={() => setDel({ kind: 'phone', owner: r.owner, id: r.id, label: formatPhoneDisplay(r.cc, r.number) })}><Trash2 className="h-3 w-3 text-destructive" /></Button></Tip>
                </>}
              </div>
            ))}</div>
          )}
        </div>

        {/* Courriels (all household) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h5 className="flex items-center gap-1.5 text-sm font-semibold"><Mail className="h-4 w-4 text-muted-foreground" />Courriels</h5>
            {editable && <Button size="sm" variant="outline" onClick={() => setEmailAdd({ owner: owners[0].key, address: '' })}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>}
          </div>
          {emailRows.length === 0 ? <p className="text-sm text-muted-foreground">Aucun</p> : (
            <div className="space-y-1.5">{emailRows.map(r => {
              const isPrimary = !!member.primaryContactEmail && member.primaryContactEmail.toLowerCase() === r.address.toLowerCase()
              return (
                <div key={`${r.owner}:${r.id}`} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="break-all font-medium">{r.address}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.ownerLabel}</span>
                  </div>
                  {isPrimary && <Badge className="h-5 shrink-0 gap-0.5 text-[10px]"><Star className="h-2.5 w-2.5 fill-current" />Principal</Badge>}
                  {r.urgence && <Badge variant="destructive" className="h-5 shrink-0 text-[10px]">Urgence</Badge>}
                  {!selfService && <CopyButton value={r.address} label="Copier le courriel" />}
                  {editable && <>
                    <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:h-7 sm:w-7" onClick={() => setEmailEdit({ id: r.id, owner: r.owner, origAddress: r.address, address: r.address, isPrimary: false, isEmergency: r.isEmergency, linkId: r.linkId, relationship: canonicalRel(r.relationship) })}><Pencil className="h-3 w-3" /></Button></Tip>
                    <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:h-7 sm:w-7" onClick={() => setDel({ kind: 'email', owner: r.owner, id: r.id, label: r.address })}><Trash2 className="h-3 w-3 text-destructive" /></Button></Tip>
                  </>}
                </div>
              )
            })}</div>
          )}
        </div>

        {/* Adresses (member's own — parents share the household address) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h5 className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="h-4 w-4 text-muted-foreground" />Adresses</h5>
            {editable && <Button size="sm" variant="outline" onClick={() => setAddrAdd({ type: 'Domicile', country: defaultCountry ?? 'Liban', city: '', details: '' })}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>}
          </div>
          {member.addresses.length === 0 ? <p className="text-sm text-muted-foreground">Aucune</p> : (
            <div className="space-y-1.5">{member.addresses.map(a => (
              <div key={a.id} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{a.city}, {a.country}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{a.type}</span>
                  {a.details && <p className="text-xs text-muted-foreground">{a.details}</p>}
                </div>
                {a.isPrimary && <Badge variant="outline" className="h-5 shrink-0 text-[10px]">Principal</Badge>}
                {editable && <>
                  <Tip content="Modifier"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:h-7 sm:w-7" onClick={() => setAddrEdit({ id: a.id, type: a.type, country: a.country, city: a.city, details: a.details ?? '', isPrimary: a.isPrimary })}><Pencil className="h-3 w-3" /></Button></Tip>
                  <Tip content="Supprimer"><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:h-7 sm:w-7" onClick={() => setDel({ kind: 'address', owner: 'self', id: a.id, label: `${a.city}, ${a.country}` })}><Trash2 className="h-3 w-3 text-destructive" /></Button></Tip>
                </>}
              </div>
            ))}</div>
          )}
        </div>
      </CardContent>

      {/* Add phone */}
      <Dialog open={!!phoneAdd} onOpenChange={(o) => { if (!o) setPhoneAdd(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un téléphone</DialogTitle></DialogHeader>
          {phoneAdd && (
            <form onSubmit={submitAddPhone} className="space-y-4">
              <OwnerField owners={owners} value={phoneAdd.owner} onChange={(v) => setPhoneAdd(f => f && { ...f, owner: v })} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2"><RequiredLabel required>Indicatif</RequiredLabel><SearchableSelect value={phoneAdd.countryCode} onValueChange={(v) => setPhoneAdd(f => f && { ...f, countryCode: v })} options={PHONE_COUNTRY_CODES} placeholder="Code pays" searchPlaceholder="Rechercher..." /></div>
                <div className="space-y-2 sm:col-span-2"><RequiredLabel required>Numéro</RequiredLabel><PhoneInput dialCode={phoneAdd.countryCode} value={phoneAdd.number} onChange={(v) => setPhoneAdd(f => f && { ...f, number: v })} required /></div>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setPhoneAdd(null)}>Annuler</Button><Button type="submit" disabled={addPhone.isPending || addGPhone.isPending}>Ajouter</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit phone */}
      <Dialog open={!!phoneEdit} onOpenChange={(o) => { if (!o) setPhoneEdit(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le téléphone</DialogTitle></DialogHeader>
          {phoneEdit && (
            <form onSubmit={submitEditPhone} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2"><RequiredLabel required>Indicatif</RequiredLabel><SearchableSelect value={phoneEdit.countryCode} onValueChange={(v) => setPhoneEdit(f => f && { ...f, countryCode: v })} options={PHONE_COUNTRY_CODES} placeholder="Code pays" searchPlaceholder="Rechercher..." /></div>
                <div className="space-y-2 sm:col-span-2"><RequiredLabel required>Numéro</RequiredLabel><PhoneInput dialCode={phoneEdit.countryCode} value={phoneEdit.number} onChange={(v) => setPhoneEdit(f => f && { ...f, number: v })} required /></div>
              </div>
              {phoneEdit.owner !== 'self' && <RelationField value={phoneEdit.relationship} onChange={(v) => setPhoneEdit(f => f && { ...f, relationship: v })} />}
              <DialogFooter><Button type="button" variant="outline" onClick={() => setPhoneEdit(null)}>Annuler</Button><Button type="submit" disabled={updPhone.isPending || updGPhone.isPending || updGLink.isPending}>Enregistrer</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add email */}
      <Dialog open={!!emailAdd} onOpenChange={(o) => { if (!o) setEmailAdd(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un courriel</DialogTitle></DialogHeader>
          {emailAdd && (
            <form onSubmit={submitAddEmail} className="space-y-4">
              <OwnerField owners={owners} value={emailAdd.owner} onChange={(v) => setEmailAdd(f => f && { ...f, owner: v })} />
              <div className="space-y-2"><RequiredLabel required>Adresse</RequiredLabel><Input type="email" required value={emailAdd.address} onChange={(e) => setEmailAdd(f => f && { ...f, address: e.target.value })} placeholder="prenom.nom@exemple.com" /></div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEmailAdd(null)}>Annuler</Button><Button type="submit" disabled={addEmail.isPending || addGEmail.isPending}>Ajouter</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit email */}
      <Dialog open={!!emailEdit} onOpenChange={(o) => { if (!o) setEmailEdit(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le courriel</DialogTitle></DialogHeader>
          {emailEdit && (
            <form onSubmit={submitEditEmail} className="space-y-4">
              <div className="space-y-2"><RequiredLabel required>Adresse</RequiredLabel><Input type="email" required value={emailEdit.address} onChange={(e) => setEmailEdit(f => f && { ...f, address: e.target.value })} placeholder="prenom.nom@exemple.com" /></div>
              {emailEdit.owner !== 'self' && <RelationField value={emailEdit.relationship} onChange={(v) => setEmailEdit(f => f && { ...f, relationship: v })} />}
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEmailEdit(null)}>Annuler</Button><Button type="submit" disabled={updEmail.isPending || updGEmail.isPending || updGLink.isPending}>Enregistrer</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add address */}
      <Dialog open={!!addrAdd} onOpenChange={(o) => { if (!o) setAddrAdd(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter une adresse</DialogTitle></DialogHeader>
          {addrAdd && (
            <form onSubmit={submitAddAddr} className="space-y-4">
              <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={addrAdd.type} onValueChange={(v) => setAddrAdd(f => f && { ...f, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ADDRESS_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2"><RequiredLabel required>Pays</RequiredLabel><Select value={addrAdd.country} onValueChange={(v) => setAddrAdd(f => f && { ...f, country: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COUNTRY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><RequiredLabel required>Ville</RequiredLabel><CitySelect value={addrAdd.city} onChange={(city) => setAddrAdd(f => f && { ...f, city })} cities={cities} /></div>
              </div>
              <div className="space-y-2"><RequiredLabel>Détails</RequiredLabel><Input value={addrAdd.details} onChange={(e) => setAddrAdd(f => f && { ...f, details: e.target.value })} placeholder="Rue, immeuble..." /></div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setAddrAdd(null)}>Annuler</Button><Button type="submit" disabled={addAddr.isPending}>Ajouter</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit address */}
      <Dialog open={!!addrEdit} onOpenChange={(o) => { if (!o) setAddrEdit(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'adresse</DialogTitle></DialogHeader>
          {addrEdit && (
            <form onSubmit={submitEditAddr} className="space-y-4">
              <div className="space-y-2"><RequiredLabel required>Type</RequiredLabel><Select value={addrEdit.type} onValueChange={(v) => setAddrEdit(f => f && { ...f, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{optionsWithCurrent(ADDRESS_TYPE_OPTIONS, addrEdit.type).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2"><RequiredLabel required>Pays</RequiredLabel><Select value={addrEdit.country} onValueChange={(v) => setAddrEdit(f => f && { ...f, country: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{optionsWithCurrent(COUNTRY_OPTIONS, addrEdit.country).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><RequiredLabel required>Ville</RequiredLabel><CitySelect value={addrEdit.city} onChange={(city) => setAddrEdit(f => f && { ...f, city })} cities={cities} /></div>
              </div>
              <div className="space-y-2"><RequiredLabel>Détails</RequiredLabel><Input value={addrEdit.details} onChange={(e) => setAddrEdit(f => f && { ...f, details: e.target.value })} placeholder="Rue, immeuble..." /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addrEdit.isPrimary} onChange={(e) => setAddrEdit(f => f && { ...f, isPrimary: e.target.checked })} />Principal</label>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setAddrEdit(null)}>Annuler</Button><Button type="submit" disabled={updAddr.isPending}>Enregistrer</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!del} onOpenChange={() => setDel(null)} title="Supprimer" description={`Supprimer « ${del?.label} » ?`} confirmLabel="Supprimer" variant="destructive"
        loading={delPhone.isPending || delGPhone.isPending || delEmail.isPending || delGEmail.isPending || delAddr.isPending} onConfirm={confirmDelete} />
    </Card>
  )
}

// Small shared "À qui ?" owner picker (Vous / a parent) for the add dialogs.
function OwnerField({ owners, value, onChange }: { owners: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2"><RequiredLabel required>À qui ?</RequiredLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{owners.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}
// Parent-relationship picker (the contact's "type") shown in the edit dialogs for a parent's contact.
function RelationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2"><RequiredLabel>Type (relation du parent)</RequiredLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{RELATIONSHIP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

// Pick the self-service or leader mutation hook (both are always instantiated to satisfy the rules of hooks).
// The two hooks differ only in their response generic (the leader POST wraps { memberId, ...data }); their
// mutateAsync inputs + isPending are identical for our use, so we type the result as the self-service hook's.
function pick<T>(selfService: boolean | undefined, self: T, leader: unknown): T { return (selfService ? self : leader) as T }
