// Landing route for a "Voir comme" session opened in a NEW tab (see impersonation-store.startInNewTab). The admin
// tab mints the read-only token and drops a short-lived localStorage handoff; this page (public — the new tab may
// have no admin auth of its own) polls for it, moves it into this tab's sessionStorage slot, becomes the member,
// and redirects to the dashboard. The original tab keeps the admin's own session, untouched.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { consumeImpersonationHandoff, setImpersonation, IMPERSONATION_HANDOFF_KEY } from '@/lib/impersonation'
import { useImpersonationStore } from '@/stores/impersonation-store'
import { useAuthStore } from '@/stores/auth-store'
import { queryClient } from '@/lib/query-client'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Button } from '@/components/ui/button'

export default function ImpersonationHandoff() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let done = false
    // Handle the handoff result once (from the storage event OR a poll — whichever sees it first).
    const handle = async () => {
      if (done) return
      const h = consumeImpersonationHandoff()
      if (!h) return
      done = true
      if (!h.ok || !h.accessToken || !h.memberId) {
        setError(h.error || "Impossible d'ouvrir la vue « Voir comme ».")
        return
      }
      // Adopt the impersonation token in THIS tab, then hydrate as the member.
      setImpersonation(h.accessToken, h.memberId, h.memberName ?? '')
      useImpersonationStore.setState({ active: true, memberId: h.memberId, memberName: h.memberName ?? '' })
      queryClient.clear()
      try { await useAuthStore.getState().loadUser() } catch { /* the app shell handles an auth failure */ }
      navigate('/dashboard', { replace: true })
    }
    // storage fires in THIS tab when the admin tab writes the handoff → instant, no polling lag.
    const onStorage = (e: StorageEvent) => { if (e.key === IMPERSONATION_HANDOFF_KEY && e.newValue) void handle() }
    window.addEventListener('storage', onStorage)
    void handle() // in case the admin tab already wrote it before we mounted
    let tries = 0
    const timer = setInterval(() => { if (done) { clearInterval(timer); return } if (++tries > 100) { clearInterval(timer); if (!done) setError("Le délai d'ouverture a expiré."); } else void handle() }, 150)
    return () => { done = true; window.removeEventListener('storage', onStorage); clearInterval(timer) }
  }, [navigate])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-md text-sm text-muted-foreground">Impossible d'ouvrir la vue « Voir comme » : {error} Réessayez depuis la fiche du membre.</p>
        <Button variant="outline" onClick={() => window.close()}>Fermer cet onglet</Button>
      </div>
    )
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <LoadingSpinner />
      <p className="text-sm text-muted-foreground">Ouverture de la vue « Voir comme »…</p>
    </div>
  )
}
