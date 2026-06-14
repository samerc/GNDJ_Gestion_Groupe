import { Link } from 'react-router'
import { ArrowRight, Compass, Users } from 'lucide-react'
import { PageHero } from '@/components/public/page-hero'
import { usePublicUnits, type PublicUnitListItem } from '@/services/public-service'

function ageLabel(min: number | null, max: number | null) {
  if (min != null && max != null) return `${min} – ${max} ans`
  if (min != null) return `${min} ans et +`
  if (max != null) return `Jusqu'à ${max} ans`
  return null
}

function UnitCard({ unit }: { unit: PublicUnitListItem }) {
  const age = ageLabel(unit.ageMin, unit.ageMax)
  return (
    <Link
      to={`/unites/${unit.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5"
    >
      <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-primary/15 to-accent/15">
        <Compass className="h-8 w-8 text-primary/40" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-semibold">{unit.name}</h3>
        {age && <span className="mt-0.5 text-xs font-medium uppercase tracking-wider text-accent">{age}</span>}
        <div className="mt-3 flex flex-1 items-end justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> {unit.memberCount} membres
          </span>
          <span className="inline-flex items-center text-sm font-medium text-primary">
            Découvrir <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function PublicUnitsPage() {
  const { data: groups, isLoading, isError } = usePublicUnits()

  return (
    <>
      <PageHero title="Nos unités" subtitle="Une unité pour chaque âge, de la jeannette au routier." />
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl border border-border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-muted-foreground">Impossible de charger les unités pour le moment.</p>
        ) : !groups || groups.length === 0 ? (
          <p className="text-muted-foreground">Les unités seront bientôt présentées ici.</p>
        ) : (
          <div className="space-y-14">
            {groups.map((group) => {
              const age = ageLabel(group.ageMin, group.ageMax)
              return (
                <div key={group.unitTypeName}>
                  <div className="mb-6 flex items-center gap-3">
                    <span
                      className="h-7 w-1.5 rounded-full"
                      style={{ backgroundColor: group.color ?? 'var(--primary)' }}
                    />
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">{group.unitTypeName}</h2>
                      {age && <p className="text-sm text-muted-foreground">{age}</p>}
                    </div>
                  </div>
                  {group.description && (
                    <p className="mb-6 max-w-3xl text-pretty leading-relaxed text-muted-foreground">{group.description}</p>
                  )}
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
