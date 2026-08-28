// Blocking first-login screen for LEADERS: shown by AppLayout when the signed-in user has
// needsContactVerification=true (a chef who became a leader but never confirmed their PERSONAL contact details —
// many still had a parent's email/phone on file). They confirm the shown email + phone in one click, or correct
// them. On success we reload the user, which clears the flag server-side and lets the app render. Runs AFTER the
// forced password change (mustChangePassword), so a new leader sets their password first, then confirms contact.
import { useState } from 'react'
import { useVerifyMyContact } from '@/services/my-profile-service'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { parseApiError } from '@/lib/error-utils'
import { AtSign } from 'lucide-react'
import { toast } from 'sonner'

// Basic email shape check (the server validates properly); just to enable/disable the button.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LeaderContactVerification() {
  const verify = useVerifyMyContact()
  const user = useAuthStore((s) => s.user)
  const loadUser = useAuthStore((s) => s.loadUser)
  const logout = useAuthStore((s) => s.logout)
  const [email, setEmail] = useState(user?.suggestedEmail ?? '')
  const [countryCode, setCountryCode] = useState(user?.suggestedPhoneCountry ?? '+961')
  const [phone, setPhone] = useState(user?.suggestedPhone ?? '')
  const [error, setError] = useState('')

  const valid = EMAIL_RE.test(email.trim())

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!valid) { setError('Saisissez une adresse email valide.'); return }
    try {
      await verify.mutateAsync({ email: email.trim(), countryCode: countryCode.trim() || '+961', phone: phone.trim() })
      toast.success('Coordonnées confirmées. Merci !')
      await loadUser() // clears needsContactVerification server-side → app renders
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <AtSign className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Vérifiez vos coordonnées</CardTitle>
          <p className="text-sm text-muted-foreground">
            En tant que chef, vos emails et messages (accès, rappels, informations) doivent arriver sur
            <strong> vos coordonnées personnelles</strong> — et non celles d'un parent. Vérifiez-les ci-dessous.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lev-email">Votre adresse email personnelle</Label>
              <Input id="lev-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email" placeholder="prenom.nom@exemple.com" />
              {!user?.suggestedEmail && (
                <p className="text-xs text-muted-foreground">Nous n'avons pas d'adresse personnelle pour vous — saisissez la vôtre.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lev-phone">Votre téléphone personnel <span className="font-normal text-muted-foreground">(facultatif)</span></Label>
              <div className="flex gap-2">
                <Input aria-label="Indicatif" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className="w-20 shrink-0" placeholder="+961" />
                <PhoneInput id="lev-phone" dialCode={countryCode} value={phone} onChange={setPhone} autoComplete="tel" placeholder="03 123 456" className="flex-1" />
              </div>
              {!user?.suggestedPhone && (
                <p className="text-xs text-muted-foreground">Ajoutez votre numéro personnel pour être joignable.</p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!valid || verify.isPending}>
              {verify.isPending ? 'Enregistrement…' : 'Confirmer mes coordonnées'}
            </Button>
          </form>
          <button type="button" onClick={() => logout()}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground">
            Se déconnecter
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
