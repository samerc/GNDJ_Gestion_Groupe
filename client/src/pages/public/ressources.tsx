import { useState } from 'react'
import { Link } from 'react-router'
import { Library, Search, FileText, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { PageHero } from '@/components/public/page-hero'
import { usePublicResources, categoryLabel, RESOURCE_CATEGORIES, type PublicResourceItem } from '@/services/resources-service'

// One resource card — cover (or a category-tinted placeholder) + title + category + tags.
function ResourceCard({ r }: { r: PublicResourceItem }) {
  return (
    <Link to={`/ressources/${r.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
      {r.coverImagePath ? (
        <img src={r.coverImagePath} alt="" loading="lazy" className="h-32 w-full object-cover" />
      ) : (
        <div className="flex h-32 items-center justify-center bg-gradient-to-br from-primary/15 to-accent/15">
          <Library className="h-8 w-8 text-primary/40" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <span className="inline-flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">{categoryLabel(r.category)}</span>
          {r.attachmentCount > 0 && <span className="inline-flex items-center gap-1 text-muted-foreground"><FileText className="h-3.5 w-3.5" /> Fichiers</span>}
        </span>
        <h3 className="mt-1.5 font-semibold leading-snug">{r.title}</h3>
        {r.excerpt && <p className="mt-2 flex-1 text-sm text-muted-foreground line-clamp-2">{r.excerpt}</p>}
        <span className="mt-3 inline-flex items-center text-sm font-medium text-primary">
          Consulter <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

// Public heritage library at `/ressources` — anonymous, paginated grid with a category filter + a text
// search (title / excerpt / tags). Chants, techniques, nœuds, badges, biographies, documents.
export default function PublicResourcesPage() {
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const { data, isLoading, isError } = usePublicResources(page, 24, { category, search: debouncedSearch || undefined })

  const pick = (c: string | null) => { setCategory(c); setPage(1) }
  const chip = (label: string, c: string | null) => (
    <button key={label} onClick={() => pick(c)}
      className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        category === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground/70 hover:bg-accent/10')}>
      {label}
    </button>
  )

  const items = data?.items ?? []

  return (
    <>
      <PageHero title="Ressources" subtitle="Chants, techniques, nœuds et mémoire du groupe." />
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-wrap gap-2">
          {chip('Tout', null)}
          {RESOURCE_CATEGORIES.map((c) => chip(c.label, c.value))}
        </div>

        {/* Search */}
        <div className="relative mb-10 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Rechercher une ressource…"
            className="w-full rounded-full border border-border bg-card py-2 pl-10 pr-4 text-sm outline-none focus:border-primary" />
        </div>

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl border border-border bg-card" />)}
          </div>
        ) : isError ? (
          <p className="text-muted-foreground">Impossible de charger les ressources pour le moment.</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Library className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Aucune ressource pour cette sélection.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((r) => <ResourceCard key={r.slug} r={r} />)}
            </div>
            {data && data.totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-3">
                <button disabled={!data.hasPreviousPage} onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-40">Précédent</button>
                <span className="text-sm text-muted-foreground">Page {data.page} / {data.totalPages}</span>
                <button disabled={!data.hasNextPage} onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-40">Suivant</button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  )
}
