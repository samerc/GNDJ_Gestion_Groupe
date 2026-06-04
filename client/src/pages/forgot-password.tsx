import { useState } from 'react'
import { Link } from 'react-router'
import { useForgotPassword } from '@/services/email-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const mutation = useForgotPassword()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await mutation.mutateAsync({ email })
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
          <CardTitle className="text-2xl">Mot de passe oublie</CardTitle>
          <CardDescription>Entrez votre adresse email pour recevoir un lien de reinitialisation.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                Si un compte existe avec cette adresse, un email de reinitialisation a ete envoye.
              </div>
              <Link to="/login" className="block text-center text-sm text-primary hover:underline">
                Retour a la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                />
              </div>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Envoi...' : 'Envoyer le lien'}
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
