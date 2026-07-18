import { useState } from 'react'
import { Link } from 'react-router'
import { useForgotUsername } from '@/services/email-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HoneypotField } from '@/components/shared/honeypot-field'

// "Identifiant oublié" — self-service access recovery. Enter an email saved on your file (your own, a
// parent's, or your contact email). The backend emails THAT address your username + a link to set your
// password. The response is always generic (whether or not the email is on file) to avoid enumeration.
export default function ForgotUsernamePage() {
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('') // honeypot — must stay empty; bots filling it are rejected server-side
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const mutation = useForgotUsername()

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">GNDJ Scout</h1>
        <p className="text-muted-foreground">Gestion de Groupe Scout</p>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Identifiant oublié</CardTitle>
          <CardDescription>
            Entrez une adresse email enregistrée sur votre dossier (la vôtre ou celle d'un parent). Vous recevrez
            votre identifiant et un lien pour choisir votre mot de passe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                Si cette adresse est enregistrée sur un dossier, vous recevrez vos accès par email. Pensez à vérifier
                vos courriers indésirables.
              </div>
              <Link to="/login" className="block text-center text-sm text-primary hover:underline">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <HoneypotField value={website} onChange={setWebsite} />
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Adresse email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="votre.email@exemple.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Envoi...' : 'Recevoir mes accès'}
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
