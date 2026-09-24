import { useAuthStore } from '@/stores/auth-store'
import { useIsRegularMember } from '@/lib/use-is-manager'
import { useSettingValue } from '@/services/settings-service'

// Whether to show the "Scanner un document avec le téléphone" button to the CURRENT user. Controlled from
// Settings → Général by `scan_upload.audience`:
//   'off'      → nobody (button hidden everywhere)
//   'maitrise' → chefs only (the pilot: CU / ACU / CG / ACG / super-admin)  ← default
//   'all'      → every member/parent (on their own laptop)
// Unknown/loading falls back to the 'maitrise' pilot (safe). This only gates the DESKTOP button — the phone scan
// page always works with a valid token (which was created by an authorized desktop user).
export function useScanUploadEnabled(): boolean {
  const user = useAuthStore((s) => s.user)
  const isRegularMember = useIsRegularMember()
  const audience = useSettingValue('scan_upload.audience')
  if (!user) return false
  if (audience === 'off') return false
  if (audience === 'all') return true
  return !isRegularMember // 'maitrise' (default / unknown / still loading)
}
