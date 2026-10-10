import { useSettingValue } from '@/services/settings-service'

// The active scout year for the whole app (cotisations, dashboards, trombinoscope, roster, export).
// It FOLLOWS the passage year — i.e. the scout year the CG opens for the passage — so there is a single
// source of truth instead of a separate, hand-maintained cotisation year that could drift out of sync.
export function useCurrentScoutYear(): string {
  // While settings load (or if unset), the year that contains today — never a hard-coded year.
  return useSettingValue('passage.scout_year') ?? calendarScoutYear()
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

// A short list of scout years around today (newest first) for a year picker. During the pre-season (August –
// September) it starts with NEXT year (the configured year), so both parallel years are selectable through the
// changeover; from October on, next year isn't offered (it showed « 2027-2028 » in October 2026).
// withNext: always offer next year (planning pages, e.g. setting up next year's document campaign early).
export function recentScoutYears(count = 4, withNext = false, date: Date = new Date()): string[] {
  const [curStart] = calendarScoutYear(date).split('-').map(Number)
  const preSeason = date.getMonth() === 7 || date.getMonth() === 8 // August, September
  const newest = preSeason || withNext ? curStart + 1 : curStart
  const years: string[] = []
  for (let s = newest; s > newest - count; s--) years.push(`${s}-${s + 1}`)
  return years
}
