import { Link, useParams } from 'react-router'
import { ArrowLeft, Users, Shield, Phone } from 'lucide-react'
import { PageHero } from '@/components/public/page-hero'
import { usePublicUnitDetail, usePublicSiteConfig, type PublicLeader } from '@/services/public-service'
import { Seo } from '@/components/public/seo'

// Format an age range into a French label, tolerating either bound being absent (returns null if both are).
function ageLabel(min: number | null, max: number | null) {
  if (min != null && max != null) return `${min} – ${max} ans`
  if (min != null) return `${min} ans et +`
  if (max != null) return `Jusqu'à ${max} ans`
  return null
}

// First letters of up to two name words → avatar initials (no member photos exposed publicly).
function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

// One maîtrise (leader) entry: initials avatar + name + role.
function LeaderCard({ leader }: { leader: PublicLeader }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-semibold text-white">
        {initials(leader.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium">{leader.name}</p>
        <p className="truncate text-sm text-muted-foreground">{leader.roleName}</p>
        {leader.phone && (
          <a href={`tel:${leader.phone.replace(/\s+/g, '')}`} className="mt-0.5 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Phone className="h-3.5 w-3.5" /> {leader.phone}
          </a>
        )}
      </div>
    </div>
  )
}

// Public unit detail at `/unites/:slug` — anonymous. Shows the unit's plain-text presentation,
// its teams, an "En bref" facts panel, the maîtrise roster, and (when open) a join CTA.
export default function PublicUnitDetailPage() {
  const { slug } = useParams()
  const { data: unit, isLoading, isError } = usePublicUnitDetail(slug)
  const { data: config } = usePublicSiteConfig() // only for inscriptionsOpen (join CTA gate)

  if (isLoading) {
    return (
      <>
        <PageHero title="Chargement…" />
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
        </section>
      </>
    )
  }

  if (isError || !unit) {
    return (
      <>
        <PageHero title="Unité introuvable" />
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="text-muted-foreground">Cette unité n'existe pas ou n'est pas publiée.</p>
          <Link to="/unites" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Retour aux unités
          </Link>
        </section>
      </>
    )
  }

  const age = ageLabel(unit.ageMin, unit.ageMax)

  return (
    <>
      <Seo title={unit.name} description={unit.publicDescription?.slice(0, 160) || `${unit.name} — ${[unit.unitTypeName, age].filter(Boolean).join(' · ')}, Groupe Notre-Dame de Jamhour.`} />
      <PageHero title={unit.name} subtitle={[unit.unitTypeName, age].filter(Boolean).join(' · ')} />

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Link to="/unites" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Toutes les unités
        </Link>

        <div className="mt-8 grid gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* Plain-text presentation (whitespace-pre-line keeps line breaks) — not CMS HTML, so no RichContent */}
            {unit.publicDescription ? (
              <div className="whitespace-pre-line text-pretty leading-relaxed text-foreground/90">
                {unit.publicDescription}
              </div>
            ) : (
              <p className="text-muted-foreground">La présentation de cette unité sera bientôt disponible.</p>
            )}

            {/* Teams */}
            {unit.teams.length > 0 && (
              <div className="mt-12">
                <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                  <Users className="h-5 w-5 text-accent" /> Les équipes
                </h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {unit.teams.map((t) => (
                    <div key={t.name} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-card">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-sm text-muted-foreground">{t.youthCount} membres</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">En bref</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Branche</dt>
                  <dd className="font-medium">{unit.unitTypeName}</dd>
                </div>
                {age && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Âge</dt>
                    <dd className="font-medium">{age}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Jeunes</dt>
                  <dd className="font-medium">{unit.totalYouth}</dd>
                </div>
                {unit.foundedDate && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Fondée en</dt>
                    <dd className="font-medium">{new Date(unit.foundedDate).getFullYear()}</dd>
                  </div>
                )}
              </dl>
            </div>

            {unit.leaders.length > 0 && (
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <Shield className="h-4 w-4" /> La maîtrise
                </h3>
                <div className="mt-4 space-y-3">
                  {unit.leaders.map((l, i) => <LeaderCard key={i} leader={l} />)}
                </div>
              </div>
            )}
          </aside>
        </div>

        {config?.inscriptionsOpen && (
          <div className="mt-16 rounded-2xl bg-gradient-to-br from-primary to-accent px-8 py-10 text-center text-white shadow-elevated">
            <h2 className="text-2xl font-bold tracking-tight">Rejoindre le Groupe</h2>
            <p className="mx-auto mt-2 max-w-lg text-white/85">Les inscriptions sont ouvertes. Présentez une demande en ligne.</p>
            <Link to="/inscription" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-primary shadow-lg transition-all hover:-translate-y-0.5">
              Demande d'inscription
            </Link>
          </div>
        )}
      </section>
    </>
  )
}
