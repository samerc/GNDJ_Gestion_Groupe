import { create } from 'zustand'
import { toast } from 'sonner'
import apiClient from '@/lib/api-client'
import { queryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'
import {
  getImpersonationTarget, setImpersonation, clearImpersonation, registerImpersonationExpiryHandler,
  writeImpersonationHandoff,
} from '@/lib/impersonation'
import { parseApiError } from '@/lib/error-utils'

// Reactive state for the "Voir comme" (impersonation) session. The token slot itself lives in
// lib/impersonation (sessionStorage, read by the non-React api-client); this store drives the UI (banner,
// menu) and owns the start/stop orchestration. Hydrates from sessionStorage so a tab reload keeps the session.
interface ImpersonateResponse { accessToken: string; memberId: string; memberName: string; expiresAt: string }

interface ImpersonationState {
  active: boolean
  memberId: string | null
  memberName: string | null
  starting: boolean
  // Begin viewing as `memberId`: mints the read-only token (with the ADMIN token — impersonation not yet
  // active), swaps it in, and reloads the profile so the whole app becomes the member. Throws on failure.
  start: (memberId: string) => Promise<void>
  // Open the "Voir comme" session in a NEW tab (the admin keeps their own session in the current tab). Opens the
  // tab synchronously (click gesture → no popup block), mints the token, and hands it off via localStorage; the
  // /voir-comme route in the new tab consumes it. Non-async; reports failure via toast.
  startInNewTab: (memberId: string) => void
  // Exit: drop the impersonation token (api-client falls back to the admin's untouched tokens) and reload the
  // admin profile.
  stop: () => Promise<void>
}

export const useImpersonationStore = create<ImpersonationState>((set) => {
  const existing = getImpersonationTarget()
  return {
    active: !!existing,
    memberId: existing?.memberId ?? null,
    memberName: existing?.memberName ?? null,
    starting: false,

    start: async (memberId: string) => {
      set({ starting: true })
      try {
        const { data } = await apiClient.post<ImpersonateResponse>(`/auth/impersonate/${memberId}`)
        setImpersonation(data.accessToken, data.memberId, data.memberName)
        set({ active: true, memberId: data.memberId, memberName: data.memberName, starting: false })
        // Drop the admin's cached data, then re-hydrate as the member (loadUser now uses the impersonation token).
        queryClient.clear()
        await useAuthStore.getState().loadUser()
        toast.success(`Vous consultez en tant que ${data.memberName}`)
      } catch (e) {
        set({ starting: false })
        throw e
      }
    },

    startInNewTab: (memberId: string) => {
      // Open the tab FIRST, synchronously, so it isn't blocked as a non-gesture popup. It shows a loader and waits
      // for the handoff (storage event + poll). The current tab stays the admin (no impersonation state set here).
      // We hand off the RESULT — token on success, the real error otherwise — so the new tab can react/report.
      window.open('/voir-comme', '_blank')
      apiClient.post<ImpersonateResponse>(`/auth/impersonate/${memberId}`)
        .then(({ data }) => writeImpersonationHandoff({ ok: true, accessToken: data.accessToken, memberId: data.memberId, memberName: data.memberName }))
        .catch((e) => { const msg = parseApiError(e); writeImpersonationHandoff({ ok: false, error: msg }); toast.error(msg) })
    },

    stop: async () => {
      clearImpersonation()
      set({ active: false, memberId: null, memberName: null })
      queryClient.clear()
      await useAuthStore.getState().loadUser()
    },
  }
})

// api-client signals here when an impersonation request 401s (token expired/rejected) — exit to the admin.
registerImpersonationExpiryHandler(() => {
  const state = useImpersonationStore.getState()
  if (!state.active) return
  toast.info('La session « Voir comme » a expiré — retour à votre compte.')
  void state.stop()
})
