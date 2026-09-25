// "Mes appareils connectés" (account menu): every device where this account is signed in (phone, PC,
// tablet…), each with its own session. The user can sign one device out, or all the others at once
// (lost / shared / public computer). This device is listed first and can't be signed out from here
// (use "Déconnexion" for that).
import { useState } from 'react'
import { toast } from 'sonner'
import { Laptop, Smartphone, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useSignOutOtherDevices } from '@/services/email-service'
import { useMyDevices, useEndMyDevice, type MyDevice } from '@/services/session-service'
import { parseUserAgent } from '@/lib/audit-format'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'

const isMobile = (ua: string | null) => !!ua && /Android|iPhone|iPad|iPod|Mobile/i.test(ua)

function fmt(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function MyDevicesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const applyTokens = useAuthStore((s) => s.applyTokens)
  const { data, isLoading, refetch } = useMyDevices(open)
  const endDevice = useEndMyDevice()
  const signOutOthers = useSignOutOtherDevices()
  const [busyId, setBusyId] = useState<string | null>(null)

  const others = (data ?? []).filter((d) => !d.isCurrent)

  const end = async (d: MyDevice) => {
    setBusyId(d.id)
    try {
      await endDevice.mutateAsync(d.id)
      toast.success(`${parseUserAgent(d.userAgent)} sera déconnecté d'ici quelques minutes.`)
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setBusyId(null)
    }
  }

  // Signs out every OTHER device; this one keeps working with the fresh token pair the server returns.
  const endOthers = async () => {
    try {
      const res = await signOutOthers.mutateAsync()
      applyTokens(res.accessToken, res.refreshToken)
      toast.success('Les autres appareils seront déconnectés d\'ici quelques minutes.')
      void refetch()
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mes appareils connectés</DialogTitle>
          <DialogDescription>
            Vous restez connecté sur chaque appareil séparément. Déconnectez un appareil perdu, partagé ou que
            vous n'utilisez plus.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
            {(data ?? []).map((d) => {
              const Icon = isMobile(d.userAgent) ? Smartphone : Laptop
              return (
                <li key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium" title={d.userAgent ?? undefined}>
                      {parseUserAgent(d.userAgent)}
                      {d.isCurrent && <Badge variant="secondary">Cet appareil</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Connecté le {fmt(d.createdAt)} · dernière activité le {fmt(d.lastActivityAt)}
                    </p>
                  </div>
                  {!d.isCurrent && (
                    <Button
                      variant="outline" size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={busyId === d.id}
                      onClick={() => end(d)}
                    >
                      <LogOut className="mr-1 h-4 w-4" />Déconnecter
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Fermer</Button>
          {others.length > 0 && (
            <Button type="button" variant="destructive" onClick={endOthers} disabled={signOutOthers.isPending}>
              {signOutOthers.isPending ? 'Déconnexion...' : others.length === 1 ? "Déconnecter l'autre appareil" : `Déconnecter les ${others.length} autres`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
