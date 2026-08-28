import { Link, useParams } from 'react-router'
import { ArrowLeft, Users, Shield, Phone } from 'lucide-react'
import { PageHero } from '@/components/public/page-hero'
import { foulardColors } from '@/components/public/foulard'
import { FoulardGlyph } from '@/components/public/foulard-glyph'
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

// A team's foulard (neckerchief) as a small scarf glyph in its own colours — the authentic sub-group identity,
// so it beats two abstract dots. Reuses the shared FoulardGlyph (one colour = solid, two distinct = striped).
// Renders nothing when the team has no colour set yet.
function TeamFoulard({ color1, color2 }: { color1: string | null; color2: string | null }) {
  if (!color1) return null
  const colors = color2 && color2.toLowerCase() !== color1.toLowerCase() ? [color1, color2] : [color1]
  return <FoulardGlyph colors={colors} className="h-[30px] w-[30px] shrink-0" />
}

// Foulard-integrated hero for the unit page: a dark base tinted by the scarf's primary colour, a thin ribbon of
// ALL the scarf's stripe colours along the top, and a large foulard emblem badge — so the unit's identity
// colours are immediate. Text stays white on the dark base regardless of the (often pale) scarf colours.
function UnitHero({ name, subtitle, colors }: { name: string; subtitle?: string; colors: string[] }) {
  const base = colors[0] ?? '#000080'
  return (
    <section
      className="relative overflow-hidden border-b border-border"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${base} 62%, #0b1220) 0%, color-mix(in srgb, ${base} 42%, #0b1220) 60%, color-mix(in srgb, ${base} 24%, #0b1220) 100%)`,
      }}
    >
      <div className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      {/* Foulard colour ribbon (all stripes) along the very top edge. */}
      <div className="absolute inset-x-0 top-0 flex h-1.5">
        {colors.map((c, i) => <div key={i} className="flex-1" style={{ backgroundColor: c }} />)}
      </div>
      <div className="relative mx-auto flex max-w-6xl items-center gap-5 px-4 py-14 sm:px-6">
        {/* Foulard emblem badge — solid white tile so even a white scarf stripe reads. */}
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-black/5">
          <FoulardGlyph colors={colors} className="h-14 w-14" />
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{name}</h1>
          {subtitle && <p className="mt-2 text-white/85">{subtitle}</p>}
        </div>
      </div>
    </section>
  )
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
  const { colors: foulard } = foulardColors(unit.name)
  // Only show teams that actually have youth (an empty sizaine/patrouille isn't presented publicly).
  const teams = unit.teams.filter((t) => t.youthCount > 0)

  return (
    <>
      <Seo title={unit.name} description={unit.publicDescription?.slice(0, 160) || `${unit.name} — ${[unit.unitTypeName, age].filter(Boolean).join(' · ')}, Groupe Notre-Dame de Jamhour.`} />
      <UnitHero name={unit.name} subtitle={[unit.unitTypeName, age].filter(Boolean).join(' · ')} colors={foulard} />

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

            {/* Teams (only those with members) */}
            {teams.length > 0 && (
              <div className="mt-12">
                <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                  <Users className="h-5 w-5 text-accent" /> Les équipes
                </h2>
                <div className="mt-5 grid gap-3">
                  {teams.map((t) => (
                    <div key={t.name} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card">
                      <TeamFoulard color1={t.color1} color2={t.color2} />
                      <span className="flex-1 font-medium">{t.name}</span>
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
                  <dt className="text-muted-foreground">Membres</dt>
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
