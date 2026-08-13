// Blocking first-login screen: shown by AppLayout whenever the signed-in user has mustChangePassword=true
// (temp/imported/leader-reset password). It replaces the whole app until the user sets their own password —
// they can't navigate anywhere else. Reuses the standard change-password endpoint (requires the current/temp
// password they just logged in with) and shows the live policy checklist. On success we reload the user, which
// clears the flag server-side and lets the app render.
import { useState } from 'react'
import { useChangePassword } from '@/services/email-service'
import { useAuthStore } from '@/stores/auth-store'
import { PasswordRules } from '@/components/auth/password-rules'
import { usePasswordPolicy, passwordMeetsPolicy } from '@/lib/password-policy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { parseApiError } from '@/lib/error-utils'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'

export function ForcePasswordChange() {
  const changePassword = useChangePassword()
  const loadUser = useAuthStore((s) => s.loadUser)
  const logout = useAuthStore((s) => s.logout)
  const { data: policy } = usePasswordPolicy()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const valid =
    current.length > 0 &&
    passwordMeetsPolicy(next, policy) &&
    next === confirm &&
    next !== current

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (next === current) { setError('Le nouveau mot de passe doit être différent de l\'actuel.'); return }
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next })
      toast.success('Mot de passe défini. Bienvenue !')
      await loadUser() // clears mustChangePassword server-side flag → app renders
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Définissez votre mot de passe</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pour votre sécurité, vous devez choisir un nouveau mot de passe personnel avant de continuer.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fpc-current">Mot de passe actuel</Label>
              <Input id="fpc-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                required autoComplete="current-password" placeholder="Celui que vous venez d'utiliser" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fpc-new">Nouveau mot de passe</Label>
              <Input id="fpc-new" type="password" value={next} onChange={(e) => setNext(e.target.value)}
                required autoComplete="new-password" />
              <div className="pt-1"><PasswordRules password={next} /></div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fpc-confirm">Confirmez le mot de passe</Label>
              <Input id="fpc-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                required autoComplete="new-password" />
              {confirm.length > 0 && confirm !== next && (
                <p className="text-xs text-destructive">Les mots de passe ne correspondent pas.</p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!valid || changePassword.isPending}>
              {changePassword.isPending ? 'Enregistrement…' : 'Définir le mot de passe'}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => logout()}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Se déconnecter
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
