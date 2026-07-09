import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useApplicantStore } from '@/stores/applicant-store'
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [website, setWebsite] = useState('') // honeypot anti-bot field
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password, website)
      navigate('/inscription/portail')
    } catch (err) {
      setError(parseApiError(err))
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Pas encore de compte ?{' '}
              <Link to="/inscription/register" className="text-primary hover:underline font-medium">Créer un compte</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </ApplicantAuthShell>
  )
}
