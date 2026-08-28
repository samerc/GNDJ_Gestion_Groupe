import { Link } from 'react-router'
import { ArrowRight, Users } from 'lucide-react'
import { PageHero } from '@/components/public/page-hero'
import { foulardColors } from '@/components/public/foulard'
import { FoulardGlyph } from '@/components/public/foulard-glyph'
import { usePublicUnits, type PublicUnitListItem } from '@/services/public-service'
import { Seo } from '@/components/public/seo'

// Format an age range into a French label, tolerating either bound being absent (returns null if both are).
function ageLabel(min: number | null, max: number | null) {
  if (min != null && max != null) return `${min} – ${max} ans`
  if (min != null) return `${min} ans et +`
  if (max != null) return `Jusqu'à ${max} ans`
  return null
}

// Single unit tile linking to its public detail page. The unit's historic foulard (scarf) colours — its
// sub-group identity — show as a compact neckerchief emblem beside the name (cleaner than a full-width block).
// Age is intentionally omitted here: it's identical for every unit in the branch and already shown once in the
// section header.
function UnitCard({ unit }: { unit: PublicUnitListItem }) {
  const { colors } = foulardColors(unit.name)
  return (
    <Link
      to={`/unites/${unit.slug}`}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-3.5">
        {/* Foulard emblem — a scarf glyph on a tile tinted with the scarf's main colour. */}
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl ring-1 ring-border/70"
          style={{ backgroundColor: `color-mix(in srgb, ${colors[0]} 12%, var(--card))` }}
        >
          <FoulardGlyph colors={colors} className="h-12 w-12" />
        </span>
        <h3 className="font-semibold leading-snug">{unit.name}</h3>
      </div>
      <div className="mt-4 flex flex-1 items-end justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {unit.memberCount} membres
        </span>
        <span className="inline-flex items-center text-sm font-medium text-primary">
          Découvrir <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

// Public units index at `/unites` — anonymous. Lists published units grouped by branch
// (unit type), each group headed by its colour bar + shared category description.
export default function PublicUnitsPage() {
  const { data: groups, isLoading, isError } = usePublicUnits()

  return (
    <>
      <Seo title="Nos unités" description="Découvrez les unités du Groupe Notre-Dame de Jamhour : une branche pour chaque âge, de la jeannette au routier." />
      <PageHero title="Nos unités" subtitle="Une unité pour chaque âge, de la jeannette au routier." />
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-muted-foreground">Impossible de charger les unités pour le moment.</p>
        ) : !groups || groups.length === 0 ? (
          <p className="text-muted-foreground">Les unités seront bientôt présentées ici.</p>
        ) : (
          <div className="space-y-16">
            {groups.map((group) => {
              const age = ageLabel(group.ageMin, group.ageMax)
              return (
                <div key={group.unitTypeName}>
                  {/* Branch header: the colour bar marks the left edge (aligned with the cards below); the
                      description spans the FULL grid width and is justified so it reads as a block matching the
                      cards rather than a narrow floating paragraph. */}
                  <div className="mb-7">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
                        <span
                          className="h-6 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: group.color ?? 'var(--primary)' }}
                        />
                        {group.unitTypeName}
                      </h2>
                      {age && (
                        <span
                          className="text-xs font-semibold uppercase tracking-wider"
                          style={{ color: group.color ?? 'var(--primary)' }}
                        >
                          {age}
                        </span>
                      )}
                    </div>
                    {group.description && (
                      <p className="mt-3 text-justify leading-relaxed text-muted-foreground">{group.description}</p>
                    )}
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.units.map((u) => <UnitCard key={u.slug} unit={u} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
