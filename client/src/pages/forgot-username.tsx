import { useState } from 'react'
import { Link } from 'react-router'
import { useForgotUsername } from '@/services/email-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Callout } from '@/components/shared/callout'
import { MemberAuthShell } from '@/components/auth/member-auth-shell'
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
    <MemberAuthShell title="Identifiant oublié" subtitle="Retrouvez votre identifiant par email">
      {sent ? (
        <div className="space-y-4">
          <Callout tone="success">
            Si cette adresse est enregistrée sur un dossier, vous recevrez vos accès par email. Pensez à vérifier
            vos courriers indésirables.
          </Callout>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <HoneypotField value={website} onChange={setWebsite} />
          <p className="text-sm text-muted-foreground">
            Entrez une adresse email enregistrée sur votre dossier (la vôtre ou celle d'un parent). Vous recevrez
            votre identifiant et un lien pour choisir votre mot de passe.
          </p>
          {error && <Callout tone="danger">{error}</Callout>}
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
            {mutation.isPending ? 'Envoi…' : 'Retrouver mon identifiant'}
          </Button>
          <Link to="/login" className="block text-center text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </form>
      )}
    </MemberAuthShell>
  )
}
