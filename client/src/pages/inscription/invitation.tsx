import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Ticket, CalendarClock, XCircle } from 'lucide-react'
import { useApplicantStore } from '@/stores/applicant-store'
import { useInviteInfo, useClaimInvite } from '@/services/applicant-service'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HoneypotField } from '@/components/shared/honeypot-field'
import { PasswordRules } from '@/components/auth/password-rules'
import { usePasswordPolicy, passwordMeetsPolicy } from '@/lib/password-policy'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { formatDateLong } from '@/lib/utils'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

// CG late-access INVITATION page (`/inscription/invitation/:token`). A family the CG lets enroll AFTER the
// deadline opens this link. It's a PUBLIC, self-contained page (outside the "submissions open" route guard, with
// its own token check) so it works even while registration is otherwise closed. Two paths:
//   • new family → registers here WITH the token (bypasses the closed-registration block + pre-verifies them);
//   • existing account → "Se connecter" → login carries the token → claims after sign-in.
// Claiming stamps the account's late-submission grant, so the wizard/submit then work for this one family.
export default function ApplicantInvitationPage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const isAuthenticated = useApplicantStore((s) => s.isAuthenticated)
  const register = useApplicantStore((s) => s.register)
  const { data: info, isLoading } = useInviteInfo(token)
  const claimInvite = useClaimInvite()

  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: policy } = usePasswordPolicy()
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const pwdValid = passwordMeetsPolicy(password, policy)
  const match = password === confirm

  if (isLoading) {
    return <ApplicantAuthShell><div className="py-10"><LoadingSpinner /></div></ApplicantAuthShell>
  }

  // Invalid / used / expired / revoked token → explain + offer the login (in case they already have an account).
  if (!info?.valid) {
    return (
      <ApplicantAuthShell subtitle="Invitation">
        <Card className="shadow-elevated">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10"><XCircle className="h-6 w-6 text-destructive" /></div>
            <CardTitle className="text-xl">Invitation indisponible</CardTitle>
            <CardDescription>{info?.reason ?? "Ce lien d'invitation n'est pas valide."}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              Vous avez déjà un compte ?{' '}
              <Link to="/inscription/login" className="font-medium text-primary hover:underline">Se connecter</Link>
            </p>
          </CardContent>
        </Card>
      </ApplicantAuthShell>
    )
  }

  const expiryNote = (
    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <CalendarClock className="h-3.5 w-3.5" />
      Valable jusqu'au {formatDateLong(info.expiresAt)}
    </p>
  )

  // Already signed in → just claim + continue.
  if (isAuthenticated) {
    const activate = async () => {
      setError(''); setLoading(true)
      try {
        await claimInvite.mutateAsync(token!)
        toast.success('Invitation activée')
        navigate('/inscription/portail')
      } catch (err) { setError(parseApiError(err)) } finally { setLoading(false) }
    }
    return (
      <ApplicantAuthShell subtitle="Invitation">
        <Card className="shadow-elevated">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100"><Ticket className="h-6 w-6 text-emerald-700" /></div>
            <CardTitle className="text-xl">Invitation à présenter une demande{info.label ? ` — ${info.label}` : ''}</CardTitle>
            <CardDescription>La Maîtrise vous autorise à présenter une demande après la date limite.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <Button className="w-full" onClick={activate} disabled={loading}>{loading ? 'Activation...' : 'Activer et continuer'}</Button>
            {expiryNote}
          </CardContent>
        </Card>
      </ApplicantAuthShell>
    )
  }

  // Not signed in → register a new account WITH this invite token.
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!emailValid) return setError('Adresse email invalide.')
    if (!pwdValid) return setError('Le mot de passe ne respecte pas toutes les exigences.')
    if (!match) return setError('Les mots de passe ne correspondent pas.')
    setLoading(true)
    try {
      await register(email, password, contactName || undefined, website, undefined, token)
      navigate('/inscription/portail')
    } catch (err) { setError(parseApiError(err)) } finally { setLoading(false) }
  }

  return (
    <ApplicantAuthShell subtitle="Invitation — créer un compte">
      <Card className="shadow-elevated">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100"><Ticket className="h-6 w-6 text-emerald-700" /></div>
          <CardTitle className="text-xl">Invitation à présenter une demande{info.label ? ` — ${info.label}` : ''}</CardTitle>
          <CardDescription>La Maîtrise vous autorise à présenter une demande après la date limite. Créez votre compte pour commencer.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <HoneypotField value={website} onChange={setWebsite} />
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="contactName">Votre nom (parent / responsable)</Label>
              <Input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Adresse email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                className={email && !emailValid ? 'border-destructive' : ''} />
              {email && !emailValid && <p className="text-xs text-destructive">Adresse email invalide.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
                className={password && !pwdValid ? 'border-destructive' : ''} />
              <PasswordRules password={password} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmer le mot de passe</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password"
                className={confirm && !match ? 'border-destructive' : ''} />
              {confirm && !match && <p className="text-xs text-destructive">Les mots de passe ne correspondent pas.</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Création...' : 'Créer mon compte'}</Button>
            {expiryNote}
            <p className="text-center text-sm text-muted-foreground">
              Vous avez déjà un compte ?{' '}
              <Link to={`/inscription/login?invite=${token}`} className="font-medium text-primary hover:underline">Se connecter</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </ApplicantAuthShell>
  )
}
