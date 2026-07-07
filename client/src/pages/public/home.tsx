import { Link } from 'react-router'
import { ArrowRight, Compass, Tent, Heart, Users, Newspaper, Calendar, CalendarDays } from 'lucide-react'
import { usePublicUnits, usePublicSiteConfig } from '@/services/public-service'
import { usePublicNews } from '@/services/news-service'
import { usePublicEvents } from '@/services/events-service'
import { formatDateLong as formatDate } from '@/lib/utils'

// Icons paired positionally with the CMS-defined home.values entries (1st value → Heart, etc.).
const VALUE_ICONS = [Heart, Tent, Users]

// Public landing page at `/` — the anonymous visitor's first screen. Mixes CMS-editable copy
// (hero / values / stats / CTA, all from the `site.content` setting) with LIVE data sections
// (featured units + latest news). Registration CTAs only appear when inscriptions are open.
export default function PublicHomePage() {
  const { data: config } = usePublicSiteConfig()
  const { data: groups } = usePublicUnits()
  const { data: news } = usePublicNews(1, 3)
  const { data: eventsData } = usePublicEvents(1, 3)
  // "Nos unités" shows one card per BRANCH (unit type). /public/units is already grouped by type and only
  // contains types that have at least one published unit, so we render every group (no slicing).
  const unitTypes = groups ?? []
  const latestNews = news?.items ?? []
  const upcomingEvents = eventsData?.items ?? []
  const home = config?.content.home // CMS-authored home copy; undefined until config loads
  const inscriptionsOpen = config?.inscriptionsOpen ?? false // gates all "Demande d'inscription" CTAs

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-accent/30 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
          <div className="max-w-2xl">
            {home?.heroBadge && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur">
                <Compass className="h-3.5 w-3.5" /> {home.heroBadge}
              </span>
            )}
            <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
              {home?.heroTitle ?? 'Groupe Notre-Dame Jamhour'}
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-white/85">{home?.heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {inscriptionsOpen && (
                <Link to="/inscription" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-primary shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0">
                  Demande d'inscription <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <Link to="/unites" className={inscriptionsOpen
                ? "inline-flex items-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur transition-all hover:bg-white/20"
                : "inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-primary shadow-lg transition-all hover:-translate-y-0.5"}>
                Découvrir les unités
              </Link>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ---------- Values ---------- */}
      {home && (
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">{home.introTitle}</h2>
            <p className="mt-4 text-muted-foreground">{home.introText}</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {home.values.map((v, i) => {
              const Icon = VALUE_ICONS[i] ?? Compass
              return (
                <div key={i} className="rounded-2xl border border-border bg-card p-6 shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 text-primary"><Icon className="h-6 w-6" /></div>
                  <h3 className="mt-4 text-lg font-semibold">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.text}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---------- Heritage strip ---------- */}
      {home && home.stats.length > 0 && (
        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-14 sm:px-6 md:grid-cols-4">
            {home.stats.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-extrabold tracking-tight text-primary">{s.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Actualités & agenda (live) — the most recent of both, side by side ---------- */}
      {(latestNews.length > 0 || upcomingEvents.length > 0) && (
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Actualités &amp; agenda</h2>
            <p className="mt-2 text-muted-foreground">Les dernières nouvelles et les prochains rendez-vous du groupe.</p>
            <div className="mt-10 grid gap-10 lg:grid-cols-2">

              {/* Dernières nouvelles */}
              {latestNews.length > 0 && (
                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-lg font-semibold"><Newspaper className="h-5 w-5 text-primary/70" /> Dernières nouvelles</h3>
                    <Link to="/actualites" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Toutes <ArrowRight className="h-4 w-4" /></Link>
                  </div>
                  <div className="space-y-3">
                    {latestNews.map((post) => (
                      <Link key={post.slug} to={`/actualites/${post.slug}`} className="group flex items-stretch gap-4 rounded-2xl border border-border bg-background p-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
                        {post.coverImagePath
                          ? <img src={post.coverImagePath} alt="" loading="lazy" className="h-16 w-20 shrink-0 rounded-xl object-cover" />
                          : <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/15"><Newspaper className="h-5 w-5 text-primary/40" /></div>}
                        <div className="min-w-0 flex-1">
                          <span className="inline-flex flex-wrap items-center gap-2 text-xs">
                            {post.publishedAt && <span className="inline-flex items-center gap-1 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> {formatDate(post.publishedAt)}</span>}
                            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">{post.tagLabel}</span>
                          </span>
                          <h4 className="mt-1 font-semibold leading-snug line-clamp-2">{post.title}</h4>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Prochains rendez-vous */}
              {upcomingEvents.length > 0 && (
                <div>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="h-5 w-5 text-primary/70" /> Prochains rendez-vous</h3>
                    <Link to="/agenda" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Agenda <ArrowRight className="h-4 w-4" /></Link>
                  </div>
                  <div className="space-y-3">
                    {upcomingEvents.map((ev) => (
                      <Link key={ev.slug} to={`/agenda/${ev.slug}`} className="group flex flex-col rounded-2xl border border-border bg-background p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                          <CalendarDays className="h-3.5 w-3.5" /> {formatDate(ev.startDate)}{ev.endDate ? ` → ${formatDate(ev.endDate)}` : ''}
                        </span>
                        <h4 className="mt-1 font-semibold leading-snug line-clamp-2">{ev.title}</h4>
                        {(ev.timeLabel || ev.location) && (
                          <p className="mt-0.5 text-sm text-muted-foreground">{[ev.timeLabel, ev.location].filter(Boolean).join(' · ')}</p>
                        )}
                        <span className="mt-2 inline-block w-fit rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{ev.tagLabel}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </section>
      )}

      {/* ---------- Units by branch (live) ---------- */}
      {unitTypes.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Nos unités</h2>
              <p className="mt-2 text-muted-foreground">Une branche pour chaque âge, du louveteau au routier.</p>
            </div>
            <Link to="/unites" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              Toutes les unités <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {unitTypes.map((g) => {
              const color = g.color ?? undefined // unit-type accent colour (hex) used for the strip + name
              const ages = g.ageMin != null && g.ageMax != null ? `${g.ageMin}–${g.ageMax} ans` : null
              return (
                <Link key={g.unitTypeId} to="/unites" className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5">
                  <div className="relative flex h-24 items-center justify-center" style={{ background: color ? `linear-gradient(135deg, ${color}26, ${color}0d)` : undefined }}>
                    <Compass className="h-8 w-8" style={{ color: color ?? undefined, opacity: 0.5 }} />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold" style={{ color }}>{g.unitTypeName}</h3>
                      {ages && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{ages}</span>}
                    </div>
                    {g.description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2">{g.description}</p>}
                    <span className="mt-3 text-xs text-muted-foreground">{g.units.length} unité{g.units.length > 1 ? 's' : ''}</span>
                    <span className="mt-3 inline-flex items-center text-sm font-medium text-primary">Découvrir <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ---------- Final CTA (only when inscriptions are open) ---------- */}
      {inscriptionsOpen && home && (
        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-accent px-8 py-14 text-center shadow-elevated sm:px-12">
            <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">{home.ctaTitle}</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">{home.ctaText}</p>
            <Link to="/inscription" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-primary shadow-lg transition-all hover:-translate-y-0.5">
              Présenter une demande <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}
    </>
  )
}
