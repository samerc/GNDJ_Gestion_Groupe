import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useResetPassword } from '@/services/email-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HoneypotField } from '@/components/shared/honeypot-field'

// "Nouveau mot de passe" — anonymous step 2 of password reset: the user lands here from
// the emailed link, which carries token+email as query params. Submits the new password.
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  // token+email come from the emailed reset link; both required (else the invalid-link card renders).
  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [website, setWebsite] = useState('') // honeypot — see forgot-password.tsx
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const mutation = useResetPassword()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères (avec majuscule, minuscule et chiffre).')
      return
    }

    try {
      await mutation.mutateAsync({ email, token, newPassword, website })
      setSuccess(true)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  // Guard: missing token/email means the link was malformed/incomplete — show invalid-link card.
  if (!token || !email) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Lien de reinitialisation invalide ou expire.
            </div>
            <Link to="/login" className="mt-4 block text-center text-sm text-primary hover:underline">
              Retour a la connexion
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">GNDJ Scout</h1>
        <p className="text-muted-foreground">Gestion de Groupe Scout</p>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Nouveau mot de passe</CardTitle>
          <CardDescription>Choisissez un nouveau mot de passe pour votre compte.</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                Votre mot de passe a ete reinitialise avec succes.
              </div>
              <Link to="/login" className="block text-center text-sm text-primary hover:underline">
                Se connecter
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <HoneypotField value={website} onChange={setWebsite} />
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Reinitialisation...' : 'Reinitialiser le mot de passe'}
              </Button>
              <Link to="/login" className="block text-center text-sm text-primary hover:underline">
                Retour a la connexion
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
