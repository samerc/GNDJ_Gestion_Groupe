import { useSettingValue } from '@/services/settings-service'

// The active scout year for the whole app (cotisations, dashboards, trombinoscope, roster, export).
// It FOLLOWS the passage year — i.e. the scout year the CG opens for the passage — so there is a single
// source of truth instead of a separate, hand-maintained cotisation year that could drift out of sync.
export function useCurrentScoutYear(): string {
  return useSettingValue('passage.scout_year') ?? '2026-2027'
}

// The scout year that CONTAINS TODAY (Oct-1 boundary) — the year currently "running" on the calendar. Differs
// from useCurrentScoutYear() during the pre-season (Aug–Sep), when the configured year is already the NEXT one.
// Used by the absence badges + the Réunions page so activity logged now (before October) is attributed to the
// running year and stays visible, letting the two years run in parallel through the changeover.
export function calendarScoutYear(date: Date = new Date()): string {
  const y = date.getFullYear()
  const start = date.getMonth() >= 9 ? y : y - 1 // month index 9 = October
  return `${start}-${start + 1}`
}

// A short list of scout years around today (newest first) for a year picker — includes next year (the
// pre-season configured year) so both parallel years are selectable during the changeover.
export function recentScoutYears(count = 4): string[] {
  const [curStart] = calendarScoutYear().split('-').map(Number)
  const years: string[] = []
  for (let s = curStart + 1; s > curStart + 1 - count; s--) years.push(`${s}-${s + 1}`)
  return years
}
