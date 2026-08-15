import { useState } from 'react'
import { Link } from 'react-router'
import { useApplicantForgotPassword } from '@/services/applicant-service'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HoneypotField } from '@/components/shared/honeypot-field'

// "Mot de passe oublié" — applicant portal (demande d'inscription). Step 1: enter the account email → the
// backend emails a reset link to that address. Generic success (anti-enumeration): we never reveal whether
// the email is registered. Distinct from the member /forgot-password (that resolves a username → member's
// contact email); here the applicant's email IS their inbox.
export default function ApplicantForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot — must stay empty; bots filling it are rejected server-side
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const mutation = useApplicantForgotPassword()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await mutation.mutateAsync({ email, website })
      setSent(true)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <ApplicantAuthShell subtitle="Réinitialiser le mot de passe de votre demande">
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-2xl">Mot de passe oublié</CardTitle>
          <CardDescription>Entrez l'adresse email de votre compte. Un lien de réinitialisation vous sera envoyé s'il existe un compte pour cette adresse.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                Si un compte existe pour <span className="font-medium">{email}</span>, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte de réception (et vos courriers indésirables).
              </div>
              <Link to="/inscription/login" className="block text-center text-sm text-primary hover:underline">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <HoneypotField value={website} onChange={setWebsite} />
              {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <div className="space-y-2">
                <Label htmlFor="email">Adresse email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Envoi...' : 'Envoyer le lien'}
              </Button>
              <Link to="/inscription/login" className="block text-center text-sm text-primary hover:underline">
                Retour à la connexion
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </ApplicantAuthShell>
  )
}
