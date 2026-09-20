import { useAuthStore } from '@/stores/auth-store'
import { useIsRegularMember } from '@/lib/use-is-manager'

// PILOT GATE — the PWA (install prompts + push notifications) is currently limited to the MAÎTRISE (chefs:
// CU / ACU / CG / ACG / super-admin) so we can test it with the leaders before rolling it out to every member
// and parent. Gates the install banner, the install menu item, the notifications toggle, and the welcome-tour
// install slide.
//
// TO ROLL OUT TO EVERYONE: change the body of usePwaEnabled to `return !!useAuthStore.getState().user` (or just
// `return true`) — i.e. drop the `!isRegularMember` restriction.
export function usePwaEnabled(): boolean {
  const user = useAuthStore((s) => s.user)
  const isRegularMember = useIsRegularMember()
  return !!user && !isRegularMember
}
