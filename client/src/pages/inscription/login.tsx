import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Compass, KeyRound } from 'lucide-react'
import { useApplicantStore } from '@/stores/applicant-store'
import { useApplicantConfig } from '@/services/applicant-service'
import { emailDomain } from '@/lib/email-domain'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HoneypotField } from '@/components/shared/honeypot-field'
import { parseApiError } from '@/lib/error-utils'

// Sign-in screen for the applicant portal — distinct from the member /login (separate auth store).
// On success goes to the portail (list of demandes).
export default function ApplicantLoginPage() {
  const navigate = useNavigate()
  const login = useApplicantStore((s) => s.login)
  const { data: config } = useApplicantConfig()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [website, setWebsite] = useState('') // honeypot anti-bot field
  const [rememberMe, setRememberMe] = useState(true) // "Rester connecté" — default ON
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0) // 3 consecutive failures → offer a password reset

  // The typed email's domain IS the member-login domain (e.g. prenom.nom@scouts.gndj) → a chef on the wrong
  // screen: suggest the member space.
  const userDomain = config?.userDomain?.toLowerCase()
  const suggestMember = !!userDomain && emailDomain(email) === userDomain

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password, website, rememberMe)
      setFailedAttempts(0)
      navigate('/inscription/portail')
    } catch (err) {
      setError(parseApiError(err))
      setFailedAttempts((n) => n + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ApplicantAuthShell subtitle="Suivre votre demande d'inscription — GNDJ Scout">
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-2xl">Se connecter à votre demande</CardTitle>
          <CardDescription>Espace réservé aux familles inscrivant un enfant, pour suivre votre demande.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <HoneypotField value={website} onChange={setWebsite} />
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="email">Adresse email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
              {/* A member-domain email → probably a chef on the wrong screen: point to the member space. */}
              {suggestMember && (
                <Link to="/login" className="mt-1 flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>Vous êtes membre ou chef&nbsp;? <span className="font-medium text-primary underline-offset-2 hover:underline">Aller à l'espace membres →</span></span>
                </Link>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link to="/inscription/forgot-password" className="text-sm text-primary hover:underline">Mot de passe oublié ?</Link>
              </div>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {/* "Rester connecté" (default ON): garde la session ~30 jours; décochez sur un appareil partagé. */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
              Rester connecté sur cet appareil
            </label>
            {/* After 3 consecutive failed attempts, proactively offer a password reset. */}
            {failedAttempts >= 3 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Vous n'arrivez pas à vous connecter&nbsp;?{' '}
                  <Link to="/inscription/forgot-password" className="font-medium underline underline-offset-2">Réinitialiser votre mot de passe</Link>.
                </span>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>
          {/* Login is now the portal's first page, so "Créer un compte" is a full, obvious button (not a small
              link) — a new family lands here and needs an unmissable way to start. */}
          <div className="mt-5 border-t pt-4 text-center">
            <p className="mb-2 text-sm text-muted-foreground">Première demande d'inscription ?</p>
            <Button asChild variant="outline" className="w-full"><Link to="/inscription/register">Créer un compte</Link></Button>
          </div>
        </CardContent>
      </Card>
    </ApplicantAuthShell>
  )
}
