import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useResetPassword } from '@/services/email-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Callout } from '@/components/shared/callout'
import { MemberAuthShell } from '@/components/auth/member-auth-shell'
import { HoneypotField } from '@/components/shared/honeypot-field'
import { PasswordRules } from '@/components/auth/password-rules'
import { usePasswordPolicy, passwordMeetsPolicy } from '@/lib/password-policy'

// "Nouveau mot de passe" — anonymous step 2 of password reset: the user lands here from
// the emailed link, which carries token+email as query params. Submits the new password.
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  // token+email come from the emailed reset link; both required (else the invalid-link card renders).
  const token = searchParams.get('token') ?? ''
  const email = searchParams.get('email') ?? ''
  // setup=1 comes from the "activation" (first access) email → switches the copy from "reset" to "activate".
  const isSetup = searchParams.get('setup') === '1'

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [website, setWebsite] = useState('') // honeypot — see forgot-password.tsx
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const mutation = useResetPassword()
  const { data: policy } = usePasswordPolicy()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    if (!passwordMeetsPolicy(newPassword, policy)) {
      setError('Le mot de passe ne respecte pas toutes les exigences.')
      return
    }

    try {
      await mutation.mutateAsync({ email, token, newPassword, website })
      setSuccess(true)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const title = isSetup ? 'Activez votre compte' : 'Nouveau mot de passe'

  // Guard: missing token/email means the link was malformed/incomplete — show the invalid-link notice.
  if (!token || !email) {
    return (
      <MemberAuthShell title={title} subtitle={null}>
        <div className="space-y-4">
          <Callout tone="danger">Lien de réinitialisation invalide ou expiré.</Callout>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </MemberAuthShell>
    )
  }

  return (
    <MemberAuthShell
      title={title}
      subtitle={isSetup
        ? 'Choisissez votre mot de passe pour accéder à votre espace GNDJ.'
        : 'Choisissez un nouveau mot de passe pour votre compte.'}
    >
      {success ? (
        <div className="space-y-4">
          <Callout tone="success">
            {isSetup
              ? 'Votre compte est activé. Vous pouvez maintenant vous connecter.'
              : 'Votre mot de passe a été réinitialisé avec succès.'}
          </Callout>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Se connecter
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <HoneypotField value={website} onChange={setWebsite} />
          {error && <Callout tone="danger">{error}</Callout>}
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nouveau mot de passe</Label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoFocus
              autoComplete="new-password"
            />
            <div className="pt-1"><PasswordRules password={newPassword} /></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending
              ? (isSetup ? 'Activation…' : 'Réinitialisation…')
              : (isSetup ? 'Activer mon compte' : 'Réinitialiser le mot de passe')}
          </Button>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </form>
      )}
    </MemberAuthShell>
  )
}
