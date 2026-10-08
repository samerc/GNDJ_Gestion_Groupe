// « Calendrier » — one place for everything dated: the group's events (each person sees those meant for them: group,
// their branch, their unit, the maîtrise, the Chef de Groupe team), their unit's réunions / sorties / camps, and the
// year's important dates (documents, passage, inscriptions for the CG team). Month grid (desktop) or list; clicking a
// day shows its items. The Chef de Groupe team adds events for anyone, a chef d'unité for their unit.
import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Smartphone, List, LayoutGrid } from 'lucide-react'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { SegmentedToggle } from '@/components/shared/segmented-toggle'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCalendar, useCalendarOptions, type CalendarItem } from '@/services/calendar-service'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { EventFormDialog } from '@/components/calendar/event-form-dialog'
import { EventDetailDialog } from '@/components/calendar/event-detail-dialog'
import { PhoneLinkDialog } from '@/components/calendar/phone-link-dialog'
import { LEGEND, WEEKDAYS, covers, dayTitle, iso, itemColor, monthGrid, monthTitle, timeLabel } from '@/components/calendar/calendar-utils'

type View = 'month' | 'list'
const MY_UNITS = '__mine__'

// Route /calendrier — any signed-in member. What each person sees is decided server-side (GET /calendar).
export default function CalendarPage() {
  const now = new Date()
  const today = iso(now)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  // Phones start in the list view (a 7-column grid is unreadable that narrow).
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'month'))
  const [selectedDay, setSelectedDay] = useState<string | null>(today)
  const [meetingUnit, setMeetingUnit] = useState(MY_UNITS)
  const [detail, setDetail] = useState<CalendarItem | null>(null)
  const [form, setForm] = useState<{ eventId: string | null; date: string; occurrence?: string } | null>(null)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const user = useAuthStore((s) => s.user)

  const weeks = useMemo(() => monthGrid(year, month), [year, month])
  // Month view fetches the whole 6-week grid (incl. the spill-over days); list view only the month itself.
  const from = view === 'month' ? iso(weeks[0][0]) : iso(new Date(year, month, 1))
  const to = view === 'month' ? iso(weeks[5][6]) : iso(new Date(year, month + 1, 0))
  const { data: items, isLoading } = useCalendar(from, to, meetingUnit === MY_UNITS ? null : meetingUnit)
  const { data: options } = useCalendarOptions()
  // Creating is allowed when the server offers at least one audience (CG team: any; chef d'unité: their unit).
  const canCreate = (options?.audiences.length ?? 0) > 0
  const canOpenMeetings = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.ATTENDANCE_MANAGE)

  const go = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth()); setSelectedDay(null)
  }
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(today) }
  const dayItems = (day: string) => (items ?? []).filter((i) => covers(i, day))

  // List view: the days of the month that have something, in order.
  const listDays = useMemo(() => {
    const days = new Map<string, CalendarItem[]>()
    for (const i of items ?? []) {
      const start = i.date < from ? from : i.date
      const end = (i.endDate ?? i.date) > to ? to : (i.endDate ?? i.date)
      // A multi-day item is listed under every day it covers (clipped to the fetched range).
      for (let d = new Date(start + 'T00:00'); iso(d) <= end; d.setDate(d.getDate() + 1)) {
        const k = iso(d); days.set(k, [...(days.get(k) ?? []), i])
      }
    }
    return [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [items, from, to])

  return (
    <Page>
      <PageHeader
        icon={CalendarDays}
        title="Calendrier"
        description="Les événements du groupe et de votre unité, les réunions et les dates importantes"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPhoneOpen(true)}><Smartphone className="mr-1.5 h-4 w-4" />Dans mon téléphone</Button>
            {canCreate && <Button onClick={() => setForm({ eventId: null, date: selectedDay ?? today })}><Plus className="mr-1.5 h-4 w-4" />Nouvel événement</Button>}
          </div>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mois précédent" onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="min-w-40 text-center text-lg font-semibold">{monthTitle(year, month)}</h2>
        <Button variant="outline" size="icon" aria-label="Mois suivant" onClick={() => go(1)}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={goToday}>Aujourd'hui</Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Réunions of any unit — only offered to callers allowed to see every unit. */}
          {options?.canSeeAllUnits && (
            <Select value={meetingUnit} onValueChange={setMeetingUnit}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={MY_UNITS}>Réunions : mes unités</SelectItem>
                {options.units.map((u) => <SelectItem key={u.id} value={u.id}>Réunions : {u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <SegmentedToggle<View> value={view} onChange={setView} size="sm"
            options={[{ value: 'month', label: 'Mois', icon: LayoutGrid }, { value: 'list', label: 'Liste', icon: List }]} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {LEGEND.map((l) => (
          <span key={l.label} className={cn('rounded border px-2 py-0.5 text-xs', itemColor(l.sample as CalendarItem))}>{l.label}</span>
        ))}
      </div>

      {isLoading && !items ? <LoadingSpinner /> : view === 'month' ? (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border">
            <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium uppercase text-muted-foreground">
              {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {weeks.flat().map((d) => {
                const k = iso(d)
                const its = dayItems(k)
                const inMonth = d.getMonth() === month
                return (
                  <button key={k} type="button" onClick={() => setSelectedDay(k)}
                    className={cn('flex min-h-24 flex-col items-stretch justify-start border-b border-r p-1 text-left transition-colors hover:bg-muted/40 [&:nth-child(7n)]:border-r-0',
                      !inMonth && 'bg-muted/20 text-muted-foreground', selectedDay === k && 'ring-2 ring-inset ring-primary')}>
                    <span className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                      k === today && 'bg-primary text-primary-foreground')}>{d.getDate()}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {its.slice(0, 3).map((i) => (
                        // Clicking an item opens it; stopPropagation so the day cell's own click (select day) doesn't fire too.
                        <span key={i.id} onClick={(e) => { e.stopPropagation(); setDetail(i) }}
                          className={cn('block truncate rounded border px-1 text-[11px] leading-5', itemColor(i))}>
                          {i.startTime ? `${i.startTime.slice(0, 5).replace(':', 'h')} ` : ''}{i.title}
                        </span>
                      ))}
                      {its.length > 3 && <span className="block px-1 text-[11px] text-muted-foreground">+{its.length - 3} autres</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          {selectedDay && (
            <section className="mt-4">
              <h3 className="mb-2 font-semibold">{dayTitle(selectedDay)}</h3>
              <DayList items={dayItems(selectedDay)} onOpen={setDetail} />
            </section>
          )}
        </>
      ) : (
        <div className="mt-4 space-y-5">
          {listDays.length === 0 && <p className="text-sm text-muted-foreground">Rien de prévu ce mois-ci.</p>}
          {listDays.map(([day, its]) => (
            <section key={day}>
              <h3 className={cn('mb-2 text-sm font-semibold', day === today && 'text-primary')}>{dayTitle(day)}{day === today ? " — aujourd'hui" : ''}</h3>
              <DayList items={its} onOpen={setDetail} />
            </section>
          ))}
        </div>
      )}

      <EventDetailDialog item={detail} onClose={() => setDetail(null)} canOpenMeetings={canOpenMeetings}
        onEdit={(id) => { setDetail(null); setForm({ eventId: id, date: today }) }}
        onEditDate={(id, date) => { setDetail(null); setForm({ eventId: id, date, occurrence: date }) }} />
      <EventFormDialog open={form !== null} onOpenChange={(o) => { if (!o) setForm(null) }} eventId={form?.eventId ?? null}
        defaultDate={form?.date ?? today} occurrenceDate={form?.occurrence ?? null} />
      <PhoneLinkDialog open={phoneOpen} onOpenChange={setPhoneOpen} />
    </Page>
  )
}

// Items of one day as clickable rows (time or "Journée", title, audience · place).
function DayList({ items, onOpen }: { items: CalendarItem[]; onOpen: (i: CalendarItem) => void }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Rien de prévu ce jour-là.</p>
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" onClick={() => onOpen(i)}
            className={cn('flex w-full items-start gap-3 rounded-lg border-l-4 bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/40', itemColor(i))}>
            <span className="w-24 shrink-0 text-sm font-medium tabular-nums">{timeLabel(i) || 'Journée'}</span>
            <span className="min-w-0">
              <span className="block break-words font-medium text-foreground">{i.title}</span>
              <span className="block text-xs text-muted-foreground">{i.audienceLabel}{i.location ? ` · ${i.location}` : ''}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
