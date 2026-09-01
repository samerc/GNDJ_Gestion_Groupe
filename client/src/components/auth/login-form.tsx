import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HoneypotField } from '@/components/shared/honeypot-field'
import type { AxiosError } from 'axios'
import type { ApiError } from '@/types/api'

// Member/chef login (the /login "Espace membres" card). On success the auth store stores the tokens
// and we navigate to the dashboard.
export function LoginForm() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [website, setWebsite] = useState('') // honeypot — must stay empty (bots fill it → server rejects)
  const [rememberMe, setRememberMe] = useState(true) // "Rester connecté" — default ON
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login({ email, password, website }, rememberMe)
      navigate('/dashboard')
    } catch (err) {
      const axiosError = err as AxiosError<ApiError>
      setError(axiosError.response?.data?.error ?? 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md shadow-elevated">
      <CardHeader>
        <CardTitle className="text-2xl">Connexion</CardTitle>
        <CardDescription>Entrez vos identifiants pour accéder à votre espace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <HoneypotField value={website} onChange={setWebsite} />
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Nom d'utilisateur</Label>
            <Input
              id="email"
              type="email"
              placeholder="prenom.nom@scouts.gndj"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
            {/* Members often mistype their personal email — clarify the synthetic login format. */}
            <p className="text-xs text-muted-foreground">
              Votre identifiant a le format <span className="font-medium">prénom.nom@scouts.gndj</span> — ce n'est pas votre adresse email personnelle.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {/* "Rester connecté" (default ON): persists the session ~30 jours; décochez sur un appareil partagé. */}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Rester connecté sur cet appareil
          </label>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </Button>
          <div className="flex flex-col items-center gap-1 text-center">
            <Link to="/forgot-password" className="text-sm text-primary hover:underline">
              Mot de passe oublié ?
            </Link>
            <Link to="/forgot-username" className="text-sm text-primary hover:underline">
              Identifiant oublié ?
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
