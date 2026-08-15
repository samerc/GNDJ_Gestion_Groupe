import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useApplicantResetPassword } from '@/services/applicant-service'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HoneypotField } from '@/components/shared/honeypot-field'
import { PasswordRules } from '@/components/auth/password-rules'
import { usePasswordPolicy, passwordMeetsPolicy } from '@/lib/password-policy'

// "Nouveau mot de passe" — applicant portal step 2: the parent lands here from the emailed reset link
// (token + email query params) and chooses a new password.
export default function ApplicantResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [website, setWebsite] = useState('') // honeypot — see forgot-password.tsx
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const mutation = useApplicantResetPassword()
  const { data: policy } = usePasswordPolicy()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    if (!passwordMeetsPolicy(newPassword, policy)) {
      setError('Le mot de passe ne respecte pas les exigences ci-dessous.')
      return
    }
    try {
      await mutation.mutateAsync({ email, token, newPassword, website })
      setSuccess(true)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  // Malformed/incomplete link (missing token or email) → invalid-link card.
  if (!token || !email) {
    return (
      <ApplicantAuthShell subtitle="Réinitialiser le mot de passe de votre demande">
        <Card className="shadow-elevated">
          <CardContent className="pt-6">
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Lien de réinitialisation invalide ou expiré.
            </div>
            <Link to="/inscription/login" className="mt-4 block text-center text-sm text-primary hover:underline">
              Retour à la connexion
            </Link>
          </CardContent>
        </Card>
      </ApplicantAuthShell>
    )
  }

  return (
    <ApplicantAuthShell subtitle="Réinitialiser le mot de passe de votre demande">
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-2xl">Nouveau mot de passe</CardTitle>
          <CardDescription>Choisissez un nouveau mot de passe pour votre compte d'inscription.</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                Votre mot de passe a été réinitialisé avec succès.
              </div>
              <Link to="/inscription/login" className="block text-center text-sm text-primary hover:underline">
                Se connecter
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <HoneypotField value={website} onChange={setWebsite} />
              {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus autoComplete="new-password" />
                <div className="pt-1"><PasswordRules password={newPassword} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
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
