import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useSidebarStore } from '@/stores/sidebar-store'
import { useNavigate } from 'react-router'
import { useChangePassword, useSignOutOtherDevices } from '@/services/email-service'
import { parseApiError } from '@/lib/error-utils'
import { PasswordRules } from '@/components/auth/password-rules'
import { usePasswordPolicy, passwordMeetsPolicy } from '@/lib/password-policy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RequiredLabel } from '@/components/shared/required-label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, Menu, KeyRound, IdCard, MonitorSmartphone } from 'lucide-react'
import { toast } from 'sonner'

// ROLE: top bar for the authenticated shell — mobile sidebar toggle (lg-hidden)
// + user dropdown (change-password dialog, logout). Session auto-refresh lives in
// the auth store / SessionWarning; this only exposes the manual actions.
export function Header() {
  const { user, logout, applyTokens } = useAuthStore()
  const { setMobileOpen } = useSidebarStore()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  const signOutOthersMutation = useSignOutOtherDevices()
  const [signOutOthersOpen, setSignOutOthersOpen] = useState(false)

  const changePasswordMutation = useChangePassword()
  const { data: passwordPolicy } = usePasswordPolicy()
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordError, setPasswordError] = useState('')

  // Client-side guard (match + policy); the server enforces the same configurable password policy.
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas.')
      return
    }
    if (!passwordMeetsPolicy(passwordForm.newPassword, passwordPolicy)) {
      setPasswordError('Le mot de passe ne respecte pas les exigences affichées.')
      return
    }
    try {
      await changePasswordMutation.mutateAsync({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword })
      toast.success('Mot de passe modifié')
      setChangePasswordOpen(false)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPasswordError(parseApiError(err))
    }
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login')
  }

  // Rotate the refresh token: signs out every OTHER device (lost/shared/public computer) while keeping
  // this one signed in via the fresh token pair the server returns.
  const handleSignOutOthers = async () => {
    try {
      const res = await signOutOthersMutation.mutateAsync()
      applyTokens(res.accessToken, res.refreshToken)
      toast.success('Les autres appareils ont été déconnectés')
      setSignOutOthersOpen(false)
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-card/70 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-lg font-bold tracking-tight lg:hidden">GNDJ Scout</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-1.5 pr-2.5 hover:bg-accent/60">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground text-xs font-semibold shadow-sm ring-1 ring-border">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
              <span className="hidden sm:inline text-sm font-medium">
                {user?.firstName} {user?.lastName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-sm">
              <p className="font-medium">{user?.firstName} {user?.lastName}</p>
              <p className="text-muted-foreground text-xs">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            {/* Every authenticated user can reach their own fiche from here — the sidebar only shows
                "Ma fiche" in the leader/member nav, so managers (CG/super-admin) rely on this entry. */}
            {user?.memberId && (
              <DropdownMenuItem onClick={() => navigate('/my-profile')}>
                <IdCard className="mr-2 h-4 w-4" />
                Ma fiche
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => { setPasswordError(''); setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); setChangePasswordOpen(true) }}>
              <KeyRound className="mr-2 h-4 w-4" />
              Modifier le mot de passe
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSignOutOthersOpen(true)}>
              <MonitorSmartphone className="mr-2 h-4 w-4" />
              Déconnecter les autres appareils
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} disabled={loggingOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {loggingOut ? 'Déconnexion...' : 'Déconnexion'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le mot de passe</DialogTitle></DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{passwordError}</div>}
            <div className="space-y-2">
              <RequiredLabel required>Mot de passe actuel</RequiredLabel>
              <Input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))} required autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Nouveau mot de passe</RequiredLabel>
              <Input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))} required autoComplete="new-password" />
              <div className="pt-1"><PasswordRules password={passwordForm.newPassword} /></div>
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Confirmer le nouveau mot de passe</RequiredLabel>
              <Input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))} required autoComplete="new-password" />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setChangePasswordOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={changePasswordMutation.isPending}>{changePasswordMutation.isPending ? 'Enregistrement...' : 'Modifier'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={signOutOthersOpen} onOpenChange={setSignOutOthersOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Déconnecter les autres appareils</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Toutes vos autres sessions (téléphone, ordinateur perdu ou partagé…) seront déconnectées d'ici
            quelques minutes. Vous resterez connecté sur cet appareil.
          </p>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setSignOutOthersOpen(false)}>Annuler</Button>
            <Button type="button" onClick={handleSignOutOthers} disabled={signOutOthersMutation.isPending}>
              {signOutOthersMutation.isPending ? 'Déconnexion...' : 'Déconnecter les autres'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
