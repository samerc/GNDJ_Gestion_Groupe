// One-time, SKIPPABLE contact-review popup shown on login until the member confirms their household contacts.
// Purpose: most members have the FATHER's email as the primary contact, but usually the MOTHER handles things —
// so member-facing mail (password reset, documents) goes to the wrong place. This modal lets the member fix their
// emails/phones, pick the courriel + téléphone principal, set the parents' situation, and per-parent urgence/
// décédé. « Confirmer » stamps Member.ContactReviewedAt (never shown again); « Plus tard » defers for the session
// only (sessionStorage) and it re-appears next login. Unified for EVERYONE (replaces the leader-only prompt); a
// converted demande member sees it on first login to confirm the info they submitted. Suppressed while impersonating.
import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useMember } from '@/services/member-service'
import { useMemberGuardians } from '@/services/guardian-service'
import { useReviewMyContacts, useAddMyEmail, useDeleteMyEmail, useAddMyPhone, useDeleteMyPhone } from '@/services/my-profile-service'
import { useAddMyGuardianEmail, useDeleteMyGuardianEmail, useAddMyGuardianPhone, useDeleteMyGuardianPhone } from '@/services/guardian-service'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { PhoneInput, formatPhoneDisplay } from '@/components/ui/phone-input'
import { SearchableSelect } from '@/components/shared/searchable-select'
import { parseApiError } from '@/lib/error-utils'
import { EMAIL_TYPE_OPTIONS, PHONE_TYPE_OPTIONS, PHONE_COUNTRY_CODES, PARENTS_SITUATION_OPTIONS } from '@/lib/options'
import { Mail, Phone, Plus, Trash2, Star, HeartPulse, AtSign } from 'lucide-react'
import { toast } from 'sonner'

const SKIP_KEY = 'contact-review.skip'

// Relationship label (accent/case-insensitive; imported values may be unaccented "Pere"/"Mere").
const normRel = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function relLabel(v: string): string {
  const m: Record<string, string> = { pere: 'Père', mere: 'Mère', tuteur: 'Tuteur', tuteurlegal: 'Tuteur légal', autre: 'Autre' }
  return m[normRel(v)] ?? v
}

// Outer gate: decides whether the popup should show at all (only mounts the data-fetching dialog when it will),
// so a member who has already reviewed (or a super-admin) fires no extra queries.
export function ContactReviewPopup() {
  const user = useAuthStore((s) => s.user)
  const [skipped, setSkipped] = useState(() => {
    try { return sessionStorage.getItem(SKIP_KEY) === '1' } catch { return false }
  })
  const shouldShow = !!user?.needsContactReview && !!user?.memberId && !skipped
  if (!shouldShow) return null
  return (
    <ContactReviewDialog
      memberId={user!.memberId}
      onSkip={() => { try { sessionStorage.setItem(SKIP_KEY, '1') } catch { /* private mode */ } setSkipped(true) }}
    />
  )
}

interface OwnerOption { key: string; label: string } // 'self' or a guardianId

function ContactReviewDialog({ memberId, onSkip }: { memberId: string; onSkip: () => void }) {
  const loadUser = useAuthStore((s) => s.loadUser)
  const { data: member } = useMember(memberId)
  const { data: guardians } = useMemberGuardians(memberId)

  const review = useReviewMyContacts()
  // Live contact add/delete (own + guardian) use the existing self-service hooks; they refetch the two queries.
  // (In-place value editing lives on Ma fiche → Famille; here delete + re-add covers a fix.)
  const addEmail = useAddMyEmail(memberId), delEmail = useDeleteMyEmail(memberId)
  const addPhone = useAddMyPhone(memberId), delPhone = useDeleteMyPhone(memberId)
  const addGEmail = useAddMyGuardianEmail(memberId), delGEmail = useDeleteMyGuardianEmail(memberId)
  const addGPhone = useAddMyGuardianPhone(memberId), delGPhone = useDeleteMyGuardianPhone(memberId)

  // Selection / flags — the decisions applied atomically on « Confirmer ».
  const [primaryEmail, setPrimaryEmail] = useState('')        // address of the courriel principal ('' = auto)
  const [primaryPhoneId, setPrimaryPhoneId] = useState('')     // id of the téléphone principal ('' = none)
  const [situation, setSituation] = useState('')               // Unis / Séparés / Divorcés
  const [flags, setFlags] = useState<Record<string, { isDeceased: boolean; isEmergencyContact: boolean }>>({})
  const [initDone, setInitDone] = useState(false)

  // One-shot hydration from the two async sources (member + guardians), the render-phase "reset" pattern (React
  // supports adjusting a component's own state during render; guarded by initDone so it converges and live
  // edits/refetches never clobber the user's choices afterward).
  if (!initDone && member && guardians) {
    setPrimaryEmail(member.primaryContactEmail ?? '')
    const ownPrimary = member.phones.find(p => p.isPrimary)
    const gPrimary = guardians.flatMap(g => g.guardian.phones).find(p => p.isPrimary)
    setPrimaryPhoneId(ownPrimary?.id ?? gPrimary?.id ?? '')
    setSituation(member.parentsSituation ?? '')
    const f: Record<string, { isDeceased: boolean; isEmergencyContact: boolean }> = {}
    for (const gl of guardians) f[gl.guardianId] = { isDeceased: gl.guardian.isDeceased, isEmergencyContact: gl.isEmergencyContact }
    setFlags(f)
    setInitDone(true)
  }

  // Add-contact dialogs (owner selector = Vous or a parent).
  const owners: OwnerOption[] = [{ key: 'self', label: 'Vous' }, ...(guardians ?? []).map(g => ({ key: g.guardianId, label: `${relLabel(g.relationshipType)} · ${g.guardian.firstName}` }))]
  const [emailForm, setEmailForm] = useState<{ owner: string; address: string; type: string } | null>(null)
  const [phoneForm, setPhoneForm] = useState<{ owner: string; countryCode: string; number: string; type: string } | null>(null)

  const submitAddEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailForm) return
    try {
      if (emailForm.owner === 'self') await addEmail.mutateAsync({ address: emailForm.address, type: emailForm.type, isPrimary: false, isEmergency: false })
      else await addGEmail.mutateAsync({ guardianId: emailForm.owner, address: emailForm.address, type: emailForm.type, isPrimary: false })
      setPrimaryEmail(emailForm.address.trim()) // they likely added it to make it the principal
      setEmailForm(null)
      toast.success('Courriel ajouté')
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const submitAddPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneForm) return
    try {
      if (phoneForm.owner === 'self') await addPhone.mutateAsync({ countryCode: phoneForm.countryCode, number: phoneForm.number, type: phoneForm.type, isPrimary: false, isEmergency: false })
      else await addGPhone.mutateAsync({ guardianId: phoneForm.owner, countryCode: phoneForm.countryCode, number: phoneForm.number, type: phoneForm.type, isPrimary: false })
      setPhoneForm(null)
      toast.success('Téléphone ajouté')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const removeEmail = async (owner: 'self' | string, id: string, address: string) => {
    try {
      if (owner === 'self') await delEmail.mutateAsync(id); else await delGEmail.mutateAsync(id)
      if (primaryEmail.toLowerCase() === address.toLowerCase()) setPrimaryEmail('')
      toast.success('Courriel supprimé')
    } catch (err) { toast.error(parseApiError(err)) }
  }
  const removePhone = async (owner: 'self' | string, id: string) => {
    try {
      if (owner === 'self') await delPhone.mutateAsync(id); else await delGPhone.mutateAsync(id)
      if (primaryPhoneId === id) setPrimaryPhoneId('')
      toast.success('Téléphone supprimé')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const confirm = async () => {
    try {
      const g = (guardians ?? []).map(gl => ({
        guardianId: gl.guardianId, linkId: gl.linkId,
        isDeceased: flags[gl.guardianId]?.isDeceased ?? gl.guardian.isDeceased,
        isEmergencyContact: flags[gl.guardianId]?.isEmergencyContact ?? gl.isEmergencyContact,
      }))
      await review.mutateAsync({ primaryContactEmail: primaryEmail || null, primaryPhoneId: primaryPhoneId || null, parentsSituation: situation || null, guardians: g })
      toast.success('Merci ! Vos coordonnées sont confirmées.')
      await loadUser() // clears needsContactReview → the popup unmounts
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const loading = !member || !guardians
  // Household email/phone rows (own + each parent's), for the "principal" pickers + delete.
  const emailRows = [
    ...(member?.emails ?? []).map(e => ({ owner: 'self' as const, id: e.id, address: e.address, ownerLabel: 'Vous' })),
    ...(guardians ?? []).flatMap(gl => gl.guardian.emails.map(em => ({ owner: gl.guardianId, id: em.id, address: em.address, ownerLabel: `${relLabel(gl.relationshipType)} · ${gl.guardian.firstName}` }))),
  ]
  const phoneRows = [
    ...(member?.phones ?? []).map(p => ({ owner: 'self' as const, id: p.id, cc: p.countryCode, number: p.number, ownerLabel: 'Vous' })),
    ...(guardians ?? []).flatMap(gl => gl.guardian.phones.map(p => ({ owner: gl.guardianId, id: p.id, cc: p.countryCode, number: p.number, ownerLabel: `${relLabel(gl.relationshipType)} · ${gl.guardian.firstName}` }))),
  ]

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onSkip() }}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><AtSign className="h-5 w-5" /></div>
          <DialogTitle className="text-center text-xl">Vérifiez vos coordonnées</DialogTitle>
          <p className="text-center text-sm text-muted-foreground">
            Nous vous contactons par email et téléphone (accès, documents, informations). Vérifiez qu'ils sont à jour
            et indiquez le <strong>courriel principal</strong> — celui qui reçoit nos messages (souvent celui de la maman).
          </p>
        </DialogHeader>

        {loading ? <LoadingSpinner /> : (
          <div className="space-y-6 py-2">
            {/* §1 — Courriel principal */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" />Courriel principal</h3>
                <Button size="sm" variant="outline" onClick={() => setEmailForm({ owner: owners[0].key, address: '', type: 'Personnel' })}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>
              </div>
              {emailRows.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Aucun courriel enregistré. Ajoutez-en un pour recevoir nos messages.</p>
              ) : (
                <div className="space-y-1.5">
                  {emailRows.map(r => {
                    const selected = !!primaryEmail && primaryEmail.toLowerCase() === r.address.toLowerCase()
                    return (
                      <label key={`${r.owner}:${r.id}`} className={`flex cursor-pointer items-center gap-3 rounded-md border p-2.5 text-sm transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                        <input type="radio" name="primary-email" checked={selected} onChange={() => setPrimaryEmail(r.address)} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{r.address}</div>
                          <div className="text-xs text-muted-foreground">{r.ownerLabel}</div>
                        </div>
                        {selected && <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" />}
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Supprimer" onClick={(e) => { e.preventDefault(); removeEmail(r.owner, r.id, r.address) }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </label>
                    )
                  })}
                  <button type="button" onClick={() => setPrimaryEmail('')} className={`text-xs ${!primaryEmail ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                    {!primaryEmail ? '● ' : '○ '}Choisir automatiquement
                  </button>
                </div>
              )}
            </section>

            {/* §1 — Téléphone principal */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Phone className="h-4 w-4" />Téléphone principal</h3>
                <Button size="sm" variant="outline" onClick={() => setPhoneForm({ owner: owners[0].key, countryCode: '+961', number: '', type: 'Mobile' })}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>
              </div>
              {phoneRows.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Aucun téléphone enregistré.</p>
              ) : (
                <div className="space-y-1.5">
                  {phoneRows.map(r => {
                    const selected = primaryPhoneId === r.id
                    return (
                      <label key={`${r.owner}:${r.id}`} className={`flex cursor-pointer items-center gap-3 rounded-md border p-2.5 text-sm transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                        <input type="radio" name="primary-phone" checked={selected} onChange={() => setPrimaryPhoneId(r.id)} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{formatPhoneDisplay(r.cc, r.number)}</div>
                          <div className="text-xs text-muted-foreground">{r.ownerLabel}</div>
                        </div>
                        {selected && <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" />}
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Supprimer" onClick={(e) => { e.preventDefault(); removePhone(r.owner, r.id) }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </label>
                    )
                  })}
                </div>
              )}
            </section>

            {/* §2 — Vos parents (urgence + décédé). Décédé is styled quietly (youth may log in). */}
            {(guardians?.length ?? 0) > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Vos parents</h3>
                <div className="space-y-2">
                  {guardians!.map(gl => {
                    const fl = flags[gl.guardianId] ?? { isDeceased: gl.guardian.isDeceased, isEmergencyContact: gl.isEmergencyContact }
                    const set = (patch: Partial<typeof fl>) => setFlags(prev => ({ ...prev, [gl.guardianId]: { ...fl, ...patch } }))
                    return (
                      <div key={gl.linkId} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{gl.guardian.firstName} {gl.guardian.lastName} <span className="text-xs font-normal text-muted-foreground">· {relLabel(gl.relationshipType)}</span></div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={fl.isEmergencyContact} onChange={(e) => set({ isEmergencyContact: e.target.checked })} /><HeartPulse className="h-3.5 w-3.5 text-destructive" />Contact d'urgence</label>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={fl.isDeceased} onChange={(e) => set({ isDeceased: e.target.checked })} />Décédé(e)</label>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* §3 — Situation des parents */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Situation des parents</h3>
              <Select value={situation || '__none__'} onValueChange={(v) => setSituation(v === '__none__' ? '' : v)}>
                <SelectTrigger className="sm:w-64"><SelectValue placeholder="Non précisé" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Non précisé —</SelectItem>
                  {PARENTS_SITUATION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </section>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onSkip} disabled={review.isPending}>Plus tard</Button>
          <Button onClick={confirm} disabled={loading || review.isPending}>{review.isPending ? 'Enregistrement…' : 'Confirmer'}</Button>
        </DialogFooter>
      </DialogContent>

      {/* Add email */}
      <Dialog open={!!emailForm} onOpenChange={(o) => { if (!o) setEmailForm(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un courriel</DialogTitle></DialogHeader>
          {emailForm && (
            <form onSubmit={submitAddEmail} className="space-y-4">
              <div className="space-y-2"><label className="text-sm font-medium">À qui ?</label>
                <Select value={emailForm.owner} onValueChange={(v) => setEmailForm(f => f && { ...f, owner: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{owners.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium">Adresse</label><Input type="email" required value={emailForm.address} onChange={(e) => setEmailForm(f => f && { ...f, address: e.target.value })} placeholder="prenom.nom@exemple.com" /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Type</label>
                <Select value={emailForm.type} onValueChange={(v) => setEmailForm(f => f && { ...f, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EMAIL_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setEmailForm(null)}>Annuler</Button><Button type="submit" disabled={addEmail.isPending || addGEmail.isPending}>Ajouter</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add phone */}
      <Dialog open={!!phoneForm} onOpenChange={(o) => { if (!o) setPhoneForm(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un téléphone</DialogTitle></DialogHeader>
          {phoneForm && (
            <form onSubmit={submitAddPhone} className="space-y-4">
              <div className="space-y-2"><label className="text-sm font-medium">À qui ?</label>
                <Select value={phoneForm.owner} onValueChange={(v) => setPhoneForm(f => f && { ...f, owner: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{owners.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2"><label className="text-sm font-medium">Indicatif</label><SearchableSelect value={phoneForm.countryCode} onValueChange={(v) => setPhoneForm(f => f && { ...f, countryCode: v })} options={PHONE_COUNTRY_CODES} placeholder="Code pays" searchPlaceholder="Rechercher..." /></div>
                <div className="space-y-2 sm:col-span-2"><label className="text-sm font-medium">Numéro</label><PhoneInput dialCode={phoneForm.countryCode} value={phoneForm.number} onChange={(v) => setPhoneForm(f => f && { ...f, number: v })} required /></div>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium">Type</label>
                <Select value={phoneForm.type} onValueChange={(v) => setPhoneForm(f => f && { ...f, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PHONE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setPhoneForm(null)}>Annuler</Button><Button type="submit" disabled={addPhone.isPending || addGPhone.isPending}>Ajouter</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
