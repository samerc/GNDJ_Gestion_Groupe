import { useEffect, useState } from 'react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Bell, BellRing, BellOff } from 'lucide-react'
import { pushSupported, pushPermission, isPushSubscribed, enablePush, disablePush } from '@/lib/push'
import { usePwaEnabled } from '@/hooks/use-pwa-audience'
import { toast } from 'sonner'

// "Activer / Désactiver les notifications" entry for the account menu. Enables Web Push on this device
// (permission prompt → subscribe → register server-side). Hidden when the browser doesn't support push
// (e.g. an iPhone that hasn't installed the app — push there needs the installed PWA). Shows a "bloquées"
// hint when the user has denied permission (they must re-enable it in the browser's site settings).
export function PushToggleMenuItem() {
  const pwaEnabled = usePwaEnabled()
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    isPushSubscribed().then((s) => { if (alive) setSubscribed(s) })
    return () => { alive = false }
  }, [])

  if (!pwaEnabled || !pushSupported()) return null

  const enable = async () => {
    setBusy(true)
    const r = await enablePush()
    setBusy(false)
    if (r === 'ok') { setSubscribed(true); toast.success('Notifications activées sur cet appareil') }
    else if (r === 'denied') toast.error('Notifications refusées. Autorisez-les dans les réglages du navigateur.')
    else if (r === 'disabled') toast.error('Les notifications ne sont pas encore configurées.')
    else toast.error("Impossible d'activer les notifications.")
  }
  const disable = async () => {
    setBusy(true)
    await disablePush()
    setBusy(false)
    setSubscribed(false)
    toast.success('Notifications désactivées sur cet appareil')
  }

  // Permission was denied and we have no subscription → can't re-prompt; guide them to browser settings.
  if (pushPermission() === 'denied' && !subscribed) {
    return (
      <DropdownMenuItem disabled title="Autorisez les notifications dans les réglages du navigateur">
        <BellOff className="mr-2 h-4 w-4" />Notifications bloquées
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); if (!busy) void (subscribed ? disable() : enable()) }}>
      {subscribed ? <BellRing className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
      {subscribed ? 'Désactiver les notifications' : 'Activer les notifications'}
    </DropdownMenuItem>
  )
}
