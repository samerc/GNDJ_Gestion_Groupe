import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, MapPin, Clock, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHero } from '@/components/public/page-hero'
import { usePublicEvents, type EventFilter, type PublicEventItem } from '@/services/events-service'
import { usePublicUnits } from '@/services/public-service'

// Parse an ISO yyyy-MM-dd WITHOUT `new Date` to avoid any timezone shift (the agenda cares about the day).
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function parts(iso: string) { const [y, m, d] = iso.split('-').map(Number); return { y, m: m - 1, d } }
function monthKey(iso: string) { const { y, m } = parts(iso); return `${y}-${m}` }
function monthLabel(iso: string) { const { y, m } = parts(iso); return `${MONTHS[m]} ${y}` }
function longDate(iso: string) { const { y, m, d } = parts(iso); return `${d} ${MONTHS[m]} ${y}` }

// One event row — a calendar-style date block + title/meta/excerpt (+ optional cover on the right).
function EventRow({ ev }: { ev: PublicEventItem }) {
  const { m, d } = parts(ev.startDate)
  return (
    <Link to={`/agenda/${ev.slug}`}
      className="group flex items-stretch gap-4 rounded-2xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 py-2 text-primary">
        <span className="text-2xl font-bold leading-none">{d}</span>
        <span className="mt-0.5 text-xs font-medium uppercase">{MONTHS[m].slice(0, 4)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">{ev.tagLabel}</span>
          {ev.timeLabel && <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" />{ev.timeLabel}</span>}
          {ev.location && <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{ev.location}</span>}
        </div>
        <h3 className="mt-1 font-semibold leading-snug">{ev.title}</h3>
        {ev.endDate && <p className="text-xs text-muted-foreground">Du {longDate(ev.startDate)} au {longDate(ev.endDate)}</p>}
        {ev.excerpt && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{ev.excerpt}</p>}
        <span className="mt-2 inline-flex items-center text-sm font-medium text-primary">
          En savoir plus <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      {ev.coverImagePath && (
        <img src={ev.coverImagePath} alt="" loading="lazy" className="hidden h-24 w-32 shrink-0 rounded-xl object-cover sm:block" />
      )}
    </Link>
  )
}

// Public agenda at `/agenda` — anonymous, UPCOMING events (soonest first), grouped by month, with a
// branch/group tag filter. Skeleton/error/empty states handled.
export default function PublicAgendaPage() {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<EventFilter>({})
  const { data, isLoading, isError } = usePublicEvents(page, 24, filter)
  const { data: groups } = usePublicUnits()

  const applyFilter = (f: EventFilter) => { setFilter(f); setPage(1) }
  const isActive = (f: EventFilter) => (f.groupOnly ?? false) === (filter.groupOnly ?? false) && (f.unitTypeId ?? null) === (filter.unitTypeId ?? null)
  const chip = (label: string, f: EventFilter) => (
    <button key={label} onClick={() => applyFilter(f)}
      className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        isActive(f) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground/70 hover:bg-accent/10')}>
      {label}
    </button>
  )

  const items = data?.items ?? []
  // Group the (already date-sorted) events by month for section headers.
  const months: { key: string; label: string; events: PublicEventItem[] }[] = []
  for (const ev of items) {
    const key = monthKey(ev.startDate)
    let g = months.find((x) => x.key === key)
    if (!g) { g = { key, label: monthLabel(ev.startDate), events: [] }; months.push(g) }
    g.events.push(ev)
  }

  return (
    <>
      <PageHero title="Agenda" subtitle="Les prochains rendez-vous du groupe." />
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="mb-10 flex flex-wrap gap-2">
          {chip('Tout', {})}
          {chip('Le groupe', { groupOnly: true })}
          {(groups ?? []).map((g) => chip(g.unitTypeName, { unitTypeId: g.unitTypeId }))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />)}
          </div>
        ) : isError ? (
          <p className="text-muted-foreground">Impossible de charger l'agenda pour le moment.</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Aucun événement à venir pour cette sélection.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {months.map((g) => (
              <div key={g.key}>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h2>
                <div className="space-y-4">
                  {g.events.map((ev) => <EventRow key={ev.slug} ev={ev} />)}
                </div>
              </div>
            ))}

            {data && data.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <button disabled={!data.hasPreviousPage} onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-40">Précédent</button>
                <span className="text-sm text-muted-foreground">Page {data.page} / {data.totalPages}</span>
                <button disabled={!data.hasNextPage} onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-40">Suivant</button>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}
