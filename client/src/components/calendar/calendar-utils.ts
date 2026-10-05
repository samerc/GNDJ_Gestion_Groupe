// Small date helpers + colours for the calendar page (local calendar days, Monday-first weeks).
import type { CalendarItem } from '@/services/calendar-service'

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// The 6 weeks (Monday → Sunday) that cover a month.
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const start = addDays(first, -((first.getDay() + 6) % 7))
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
}

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export const monthTitle = (year: number, month: number) => {
  const s = new Date(year, month, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const dayTitle = (isoDay: string) => {
  const [y, m, d] = isoDay.split('-').map(Number)
  const s = new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// "14h00 – 16h00", "14h00" or "" (all day).
export function timeLabel(i: Pick<CalendarItem, 'startTime' | 'endTime'>): string {
  const t = (v: string) => v.slice(0, 5).replace(':', 'h')
  if (!i.startTime) return ''
  return i.endTime ? `${t(i.startTime)} – ${t(i.endTime)}` : t(i.startTime)
}

// Does the item cover this day (multi-day items span their days)?
export const covers = (i: CalendarItem, day: string) => i.date <= day && (i.endDate ?? i.date) >= day

// Colour per kind / audience: our events by audience, réunions in sky, important dates in red.
export function itemColor(i: CalendarItem): string {
  if (i.kind === 'date') return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900'
  if (i.kind === 'meeting') return 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-900'
  switch (i.audience) {
    case 'Group': return 'bg-primary/15 text-primary border-primary/30'
    case 'Branch': return 'bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-900'
    case 'Unit': return 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900'
    case 'Maitrise': return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900'
    default: return 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900'
  }
}

export const LEGEND: { label: string; sample: Pick<CalendarItem, 'kind' | 'audience'> }[] = [
  { label: 'Groupe', sample: { kind: 'event', audience: 'Group' } },
  { label: 'Branche', sample: { kind: 'event', audience: 'Branch' } },
  { label: 'Unité', sample: { kind: 'event', audience: 'Unit' } },
  { label: 'Maîtrise', sample: { kind: 'event', audience: 'Maitrise' } },
  { label: 'Équipe CG', sample: { kind: 'event', audience: 'CgTeam' } },
  { label: 'Réunions', sample: { kind: 'meeting', audience: 'Unit' } },
  { label: 'Dates importantes', sample: { kind: 'date', audience: 'Group' } },
]

export const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Pas de rappel' },
  { value: '60', label: '1 heure avant' },
  { value: '180', label: '3 heures avant' },
  { value: '1440', label: '1 jour avant' },
  { value: '2880', label: '2 jours avant' },
  { value: '10080', label: '1 semaine avant' },
]
