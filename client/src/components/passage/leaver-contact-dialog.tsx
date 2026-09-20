import { useState } from 'react'
import { useMember, useSaveLeaverContact } from '@/services/member-service'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { LogOut } from 'lucide-react'

// Shown when a CU marks a member "Quitte le groupe" at passage. Lets the CU confirm/capture the member's
// PERSONAL email + phone (prefilled from the fiche) so the group can re-contact them next year as an alumnus,
// then records the departure. Both fields are optional — the CU can skip and just confirm the departure.
export function LeaverContactDialog({
  open, onOpenChange, memberId, memberName, onConfirm, progress, onSkip,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  memberId: string | null
  memberName: string
  // Records the actual "Quitte le groupe" passage line (with an optional note). Runs after the contact is saved.
  // Does NOT close the dialog — the parent decides what happens next (close, or advance to the next member).
  onConfirm: (notes: string) => Promise<void>
  // When stepping through several leavers, {current,total} shows progress and onSkip advances without recording.
  progress?: { current: number; total: number }
  onSkip?: () => void
}) {
  const { data: member, isLoading } = useMember(open && memberId ? memberId : '')
  const saveContact = useSaveLeaverContact()

  const [email, setEmail] = useState('')
  const [dialCode, setDialCode] = useState('+961')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  // Tracks which member the form is currently prefilled for, so we re-prefill when the detail arrives or the
  // dialog steps to the next leaver (and reset when it closes). Render-phase reset — the supported "adjust state
  // when a prop changes" pattern; a setState-in-effect is forbidden by the React Compiler lint rule.
  const [hydratedId, setHydratedId] = useState<string | null>(null)

  if (!open && hydratedId !== null) setHydratedId(null)
  if (open && member && hydratedId !== member.id) {
    setHydratedId(member.id)
    // Prefill from the fiche: primary contact email → primary/first own email; primary/first own phone.
    setEmail(member.primaryContactEmail || member.emails.find(e => e.isPrimary)?.address || member.emails[0]?.address || '')
    const bestPhone = member.phones.find(p => p.isPrimary) || member.phones[0]
    setDialCode(bestPhone?.countryCode || '+961')
    setPhone(bestPhone?.number || '')
    setNotes('')
  }

  // Candidate emails offered as autocomplete suggestions (the member's own + any linked guardian emails).
  const emailSuggestions = member
    ? [...new Set([...member.emails.map(e => e.address), ...member.guardianEmails])].filter(Boolean)
    : []

  const confirm = async () => {
    if (!memberId) return
    setBusy(true)
    try {
      const e = email.trim()
      const p = phone.trim()
      // Only touch the contacts if the CU actually entered something.
      if (e || p) {
        await saveContact.mutateAsync({ id: memberId, email: e || null, phoneCountryCode: dialCode, phone: p || null })
      }
      // The parent records the departure and then closes or advances to the next leaver — we don't self-close.
      await onConfirm(notes.trim())
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-orange-600" />
            Quitte le groupe — {memberName}
            {progress && <span className="text-sm font-normal text-muted-foreground">({progress.current}/{progress.total})</span>}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vérifiez les coordonnées <strong>personnelles</strong> de {memberName} pour pouvoir le/la recontacter
              l'an prochain. Elles sont enregistrées sur sa fiche (ancien membre). Vous pouvez laisser vide.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium">Courriel personnel</label>
              <Input
                type="email"
                list="leaver-email-suggestions"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="prenom@domaine.com"
              />
              <datalist id="leaver-email-suggestions">
                {emailSuggestions.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Téléphone personnel</label>
              <div className="flex gap-2">
                <Input value={dialCode} onChange={e => setDialCode(e.target.value)} className="w-20" placeholder="+961" />
                <PhoneInput dialCode={dialCode} value={phone} onChange={setPhone} placeholder="76 123 456" className="flex-1" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Note (facultatif)</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Raison du départ, destination..." />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {onSkip ? 'Annuler tout' : 'Annuler'}
          </Button>
          {onSkip && (
            <Button variant="ghost" onClick={onSkip} disabled={busy}>Passer</Button>
          )}
          <Button className="bg-orange-600 text-white hover:bg-orange-700" onClick={confirm} disabled={busy || isLoading}>
            {busy ? 'Enregistrement...' : 'Confirmer le départ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
