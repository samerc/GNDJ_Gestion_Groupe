import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApplicantStore } from '@/stores/applicant-store'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HoneypotField } from '@/components/shared/honeypot-field'
import { PasswordRules } from '@/components/auth/password-rules'
import { usePasswordPolicy, passwordMeetsPolicy } from '@/lib/password-policy'
import { parseApiError } from '@/lib/error-utils'

// Account-creation screen for the applicant portal (parent or future member).
// Uses the ISOLATED applicant auth store (separate JWT/`applicant` claim — never the member User).
// On success it lands on the portail; email verification happens later via the emailed link.
export default function ApplicantRegisterPage() {
  const navigate = useNavigate()
  const register = useApplicantStore((s) => s.register)
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [website, setWebsite] = useState('') // honeypot — bots fill it, real users never see it
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Live field checks drive the inline red borders below; re-checked on submit before the API call.
  const { data: policy } = usePasswordPolicy() // the same complexity policy the server enforces
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const pwdValid = passwordMeetsPolicy(password, policy)
  const match = password === confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!emailValid) return setError('Adresse email invalide.')
    if (!pwdValid) return setError('Le mot de passe ne respecte pas toutes les exigences.')
    if (!match) return setError('Les mots de passe ne correspondent pas.')
    setLoading(true)
    try {
      await register(email, password, contactName || undefined, website)
      navigate('/inscription/portail')
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ApplicantAuthShell subtitle="Créer un compte">
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-2xl">Créer un compte</CardTitle>
          <CardDescription>Un parent ou le futur membre peut créer le compte.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
              {/* All requirements shown up-front as a live checklist (ticks green as they're met) */}
              <PasswordRules password={password} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmer le mot de passe</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password"
                className={confirm && !match ? 'border-destructive' : ''} />
              {confirm && !match && <p className="text-xs text-destructive">Les mots de passe ne correspondent pas.</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Après la création du compte, vous devrez lire et accepter les conditions d'inscription avant de continuer.
            </p>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Création...' : 'Créer mon compte'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Déjà un compte ?{' '}
              <Link to="/inscription/login" className="text-primary hover:underline font-medium">Se connecter</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </ApplicantAuthShell>
  )
}
