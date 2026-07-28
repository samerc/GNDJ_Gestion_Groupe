import { useSettingValue } from '@/services/settings-service'

// The active scout year for the whole app (cotisations, dashboards, trombinoscope, roster, export).
// It FOLLOWS the passage year — i.e. the scout year the CG opens for the passage — so there is a single
// source of truth instead of a separate, hand-maintained cotisation year that could drift out of sync.
export function useCurrentScoutYear(): string {
  return useSettingValue('passage.scout_year') ?? '2026-2027'
}
