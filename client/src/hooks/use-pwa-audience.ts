import { useAuthStore } from '@/stores/auth-store'
import { useIsRegularMember } from '@/lib/use-is-manager'
import { useSettingValue } from '@/services/settings-service'

// Whether to PROMOTE the app (install prompts + push) to the CURRENT user. Controlled from Settings → Général
// by `pwa.install_promotion`:
//   'off'      → nobody (removes the whole install/notifications UI)
//   'maitrise' → chefs only (the pilot: CU / ACU / CG / ACG / super-admin)  ← default
//   'all'      → every member and parent
// Unknown/loading falls back to the 'maitrise' pilot (safe). Gates the install banner/card + desktop QR, the
// account-menu install entry, the notifications toggle, and the welcome-tour install slide.
export function usePwaEnabled(): boolean {
  const user = useAuthStore((s) => s.user)
  const isRegularMember = useIsRegularMember()
  const promotion = useSettingValue('pwa.install_promotion')
  if (!user) return false
  if (promotion === 'off') return false
  if (promotion === 'all') return true
  return !isRegularMember // 'maitrise' (default / unknown / still loading)
}
