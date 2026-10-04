import { useState } from 'react'
import { Link } from 'react-router'
import { useForgotPassword, type ForgotPasswordResult } from '@/services/email-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Callout } from '@/components/shared/callout'
import { MemberAuthShell } from '@/components/auth/member-auth-shell'
import { HoneypotField } from '@/components/shared/honeypot-field'

// "Mot de passe oublié" — anonymous step 1 of password reset: enter username → backend resolves the
// member's real contact email and sends a reset link there. Reports whether the account was found +
// the masked address the link went to (not anti-enumeration — an internal group tool, product owner's choice).
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot — must stay empty; bots filling it are rejected server-side
  const [result, setResult] = useState<ForgotPasswordResult | null>(null) // set once the request succeeds
  const [error, setError] = useState('')
  const mutation = useForgotPassword()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res = await mutation.mutateAsync({ email, website })
      setResult(res)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  // Account found + a link was sent to at least one address.
  const sentToSomewhere = result?.found && result.sentTo.length > 0

  return (
    <MemberAuthShell title="Mot de passe oublié" subtitle="Recevez un lien pour choisir un nouveau mot de passe">
      {sentToSomewhere ? (
        <div className="space-y-4">
          <Callout tone="success">
            Compte trouvé. Un lien de réinitialisation a été envoyé à&nbsp;
            <span className="font-medium">{result!.sentTo.join(', ')}</span>.
          </Callout>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </div>
      ) : result?.found ? (
        // Account exists but has no email on file — can't deliver the link.
        <div className="space-y-4">
          <Callout tone="warning">
            Compte trouvé, mais aucune adresse email n'est enregistrée sur le dossier. Contactez un responsable pour réinitialiser votre mot de passe.
          </Callout>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <HoneypotField value={website} onChange={setWebsite} />
          <p className="text-sm text-muted-foreground">
            Entrez votre identifiant. Le lien de réinitialisation sera envoyé à l'adresse email enregistrée sur votre dossier.
          </p>
          {result && !result.found && (
            <Callout tone="danger">
              Compte introuvable. Vérifiez votre identifiant (ex. : prenom.nom@scouts.gndj).{' '}
              <Link to="/forgot-username" className="font-medium underline underline-offset-2">Identifiant oublié&nbsp;?</Link>
            </Callout>
          )}
          {error && <Callout tone="danger">{error}</Callout>}
          <div className="space-y-2">
            <Label htmlFor="email">Identifiant</Label>
            <Input
              id="email"
              name="username"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              placeholder="prenom.nom@scouts.gndj"
            />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Envoi…' : 'Envoyer le lien'}
          </Button>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </form>
      )}
    </MemberAuthShell>
  )
}
