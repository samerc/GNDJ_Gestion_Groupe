import { Link, useParams } from 'react-router'
import { ArrowLeft, CalendarDays, Clock, MapPin } from 'lucide-react'
import { PageHero } from '@/components/public/page-hero'
import { RichContent } from '@/components/public/rich-content'
import { usePublicEvent } from '@/services/events-service'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function longDate(iso: string) { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}` }

// Public single-event page at `/agenda/:slug` — anonymous. Fetches one published event by slug;
// shows loading/not-found fallbacks, then the schedule (date/time/location) and the CMS body.
export default function PublicEventPage() {
  const { slug } = useParams()
  const { data: ev, isLoading, isError } = usePublicEvent(slug)

  if (isLoading) {
    return (
      <>
        <PageHero title="Chargement…" />
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
        </section>
      </>
    )
  }

  if (isError || !ev) {
    return (
      <>
        <PageHero title="Événement introuvable" />
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <p className="text-muted-foreground">Cet événement n'existe pas ou n'est pas publié.</p>
          <Link to="/agenda" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Retour à l'agenda
          </Link>
        </section>
      </>
    )
  }

  return (
    <>
      <PageHero title={ev.title} />
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/agenda" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Tout l'agenda
          </Link>
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">{ev.tagLabel}</span>
        </div>

        {/* Schedule card — date range, time, location */}
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-border bg-card px-5 py-4 text-sm shadow-card">
          <span className="inline-flex items-center gap-2 font-medium">
            <CalendarDays className="h-4 w-4 text-primary" />
            {ev.endDate ? `Du ${longDate(ev.startDate)} au ${longDate(ev.endDate)}` : longDate(ev.startDate)}
          </span>
          {ev.timeLabel && <span className="inline-flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" />{ev.timeLabel}</span>}
          {ev.location && <span className="inline-flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{ev.location}</span>}
        </div>

        {/* Cover image (when set) */}
        {ev.coverImagePath && (
          <img src={ev.coverImagePath} alt="" loading="lazy"
            className="mt-8 aspect-[16/9] w-full rounded-2xl border border-border object-cover shadow-card" />
        )}

        {/* Event body — author HTML, sanitized by RichContent (DOMPurify) before render */}
        <RichContent html={ev.bodyHtml} className="mt-8" />
      </article>
    </>
  )
}
