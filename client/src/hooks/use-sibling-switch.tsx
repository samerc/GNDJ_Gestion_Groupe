// Switching to a confirmed sibling's account — shared by the account menu (« Changer de compte ») and « Ma famille ».
// Order: (1) the account is remembered on this device → instant; (2) the server allows it without a password (same
// main email, no maîtrise account on either side) → instant; (3) otherwise ask that account's password once
// (the dialog returned by the hook). The current account stays in the device pool, so switching back works.
// A chef's account (maîtrise / leader) is never remembered: its password is asked EVERY time.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Callout } from '@/components/shared/callout'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export interface SwitchTarget { memberId: string; name: string; username: string; passwordless?: boolean; protected?: boolean }

export function useSiblingSwitch() {
  const { switchToAccount, switchSibling, addAndSwitchAccount } = useAuthStore()
  const navigate = useNavigate()
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [pwTarget, setPwTarget] = useState<SwitchTarget | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const done = (name: string) => {
    toast.success(`Connecté en tant que ${name}`)
    navigate('/dashboard', { replace: true })
  }

  const switchTo = async (acc: SwitchTarget) => {
    setSwitchingId(acc.memberId)
    try {
      if (acc.protected) { setPassword(''); setError(''); setPwTarget(acc); return }
      try {
        await switchToAccount(acc.memberId) // remembered on this device
        return done(acc.name)
      } catch (e) {
        if (!(e instanceof Error && e.message === 'NO_SESSION')) throw e
      }
      if (acc.passwordless) {
        try {
          await switchSibling(acc.memberId)
          return done(acc.name)
        } catch { /* refused (e.g. the main email changed meanwhile) → ask for the password */ }
      }
      setPassword(''); setError(''); setPwTarget(acc)
    } catch {
      toast.error('Impossible de changer de compte. Réessayez.')
    } finally {
      setSwitchingId(null)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwTarget) return
    setError(''); setLoggingIn(true)
    try {
      await addAndSwitchAccount(pwTarget.username, password)
      const name = pwTarget.name
      setPwTarget(null); setPassword('')
      done(name)
    } catch (err) {
      setError(parseApiError(err) || 'Mot de passe incorrect.')
    } finally {
      setLoggingIn(false)
    }
  }

  // First switch to an account that needs its password — entered once, then remembered on this device.
  const dialog = (
    <Dialog open={!!pwTarget} onOpenChange={(o) => !o && setPwTarget(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Se connecter en tant que {pwTarget?.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {pwTarget?.protected
              ? 'Compte de chef : son mot de passe est demandé à chaque changement de compte.'
              : 'Entrez le mot de passe de ce compte une première fois. Il sera mémorisé sur cet appareil pour changer de compte instantanément ensuite.'}
          </p>
          {error && <Callout tone="danger">{error}</Callout>}
          <div className="space-y-2">
            <RequiredLabel>Identifiant</RequiredLabel>
            <Input value={pwTarget?.username ?? ''} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <RequiredLabel required>Mot de passe</RequiredLabel>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus autoComplete="current-password" />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setPwTarget(null)}>Annuler</Button>
            <Button type="submit" disabled={loggingIn}>{loggingIn ? 'Connexion…' : 'Se connecter'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )

  return { switchTo, switchingId, dialog }
}
