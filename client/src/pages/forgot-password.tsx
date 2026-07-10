import { useState } from 'react'
import { Link } from 'react-router'
import { useForgotPassword, type ForgotPasswordResult } from '@/services/email-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">GNDJ Scout</h1>
        <p className="text-muted-foreground">Gestion de Groupe Scout</p>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Mot de passe oublié</CardTitle>
          <CardDescription>Entrez votre nom d'utilisateur. Le lien de réinitialisation sera envoyé à l'adresse courriel enregistrée sur votre dossier.</CardDescription>
        </CardHeader>
        <CardContent>
          {sentToSomewhere ? (
            <div className="space-y-4">
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                Compte trouvé. Un lien de réinitialisation a été envoyé à&nbsp;
                <span className="font-medium">{result!.sentTo.join(', ')}</span>.
              </div>
              <Link to="/login" className="block text-center text-sm text-primary hover:underline">
                Retour à la connexion
              </Link>
            </div>
          ) : result?.found ? (
            // Account exists but has no email on file — can't deliver the link.
            <div className="space-y-4">
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                Compte trouvé, mais aucune adresse courriel n'est enregistrée sur le dossier. Contactez un responsable pour réinitialiser votre mot de passe.
              </div>
              <Link to="/login" className="block text-center text-sm text-primary hover:underline">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <HoneypotField value={website} onChange={setWebsite} />
              {result && !result.found && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  Compte introuvable. Vérifiez votre nom d'utilisateur.
                </div>
              )}
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Nom d'utilisateur</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="prenom.nom@scouts.gndj"
                />
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Envoi...' : 'Envoyer le lien'}
              </Button>
              <Link to="/login" className="block text-center text-sm text-primary hover:underline">
                Retour à la connexion
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
