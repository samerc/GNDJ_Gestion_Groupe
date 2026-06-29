import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Newspaper, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHero } from '@/components/public/page-hero'
import { usePublicNews, type NewsFilter, type PublicNewsItem } from '@/services/news-service'
import { usePublicUnits } from '@/services/public-service'

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Cover area for a card: the post's image when set, else the branded gradient + icon placeholder.
function Cover({ post, className }: { post: PublicNewsItem; className?: string }) {
  if (post.coverImagePath) {
    return <img src={post.coverImagePath} alt="" loading="lazy" className={cn('w-full object-cover', className)} />
  }
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br from-primary/15 to-accent/15', className)}>
      <Newspaper className="h-9 w-9 text-primary/40" />
    </div>
  )
}

// Standard news card (grid).
function NewsCard({ post }: { post: PublicNewsItem }) {
  return (
    <Link to={`/actualites/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
      <Cover post={post} className="h-40" />
      <div className="flex flex-1 flex-col p-5">
        <span className="inline-flex flex-wrap items-center gap-2 text-xs">
          {post.publishedAt && <span className="inline-flex items-center gap-1 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> {formatDate(post.publishedAt)}</span>}
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">{post.tagLabel}</span>
        </span>
        <h3 className="mt-1.5 font-semibold leading-snug">{post.title}</h3>
        {post.excerpt && <p className="mt-2 flex-1 text-sm text-muted-foreground line-clamp-3">{post.excerpt}</p>}
        <span className="mt-3 inline-flex items-center text-sm font-medium text-primary">
          Lire <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

// Featured lead — the latest post, shown wide (image beside text) at the top of page 1.
function FeaturedCard({ post }: { post: PublicNewsItem }) {
  return (
    <Link to={`/actualites/${post.slug}`}
      className="group mb-10 grid overflow-hidden rounded-3xl border border-border bg-card shadow-card transition-all hover:shadow-elevated md:grid-cols-2">
      <Cover post={post} className="h-56 md:h-full md:min-h-64" />
      <div className="flex flex-col justify-center p-6 sm:p-8">
        <span className="inline-flex flex-wrap items-center gap-2 text-xs">
          {post.publishedAt && <span className="inline-flex items-center gap-1 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> {formatDate(post.publishedAt)}</span>}
          <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">{post.tagLabel}</span>
        </span>
        <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{post.title}</h2>
        {post.excerpt && <p className="mt-3 text-pretty text-muted-foreground line-clamp-3">{post.excerpt}</p>}
        <span className="mt-5 inline-flex items-center text-sm font-semibold text-primary">
          Lire l'article <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

// Public news index at `/actualites` — anonymous, paginated grid of published posts (12/page) with a
// featured lead on page 1 and a branch/group tag filter. Skeleton/error/empty states handled.
export default function PublicNewsPage() {
  const [page, setPage] = useState(1) // 1-based; drives the paged query
  const [filter, setFilter] = useState<NewsFilter>({}) // {} = all, {groupOnly} or {unitTypeId}
  const { data, isLoading, isError } = usePublicNews(page, 12, filter)
  const { data: groups } = usePublicUnits() // branch chips

  // Changing the filter always resets to page 1.
  const applyFilter = (f: NewsFilter) => { setFilter(f); setPage(1) }
  const isActive = (f: NewsFilter) => (f.groupOnly ?? false) === (filter.groupOnly ?? false) && (f.unitTypeId ?? null) === (filter.unitTypeId ?? null)

  const chip = (label: string, f: NewsFilter) => (
    <button key={label} onClick={() => applyFilter(f)}
      className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        isActive(f) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground/70 hover:bg-accent/10')}>
      {label}
    </button>
  )

  // Featured only on page 1 (the newest of the current filtered set); rest go to the grid.
  const items = data?.items ?? []
  const showFeatured = page === 1 && items.length > 0
  const featured = showFeatured ? items[0] : null
  const gridItems = showFeatured ? items.slice(1) : items

  return (
    <>
      <PageHero title="Actualités" subtitle="Les dernières nouvelles et événements du groupe." />
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* Tag filter (branch / group) */}
        <div className="mb-10 flex flex-wrap gap-2">
          {chip('Tout', {})}
          {chip('Le groupe', { groupOnly: true })}
          {(groups ?? []).map((g) => chip(g.unitTypeName, { unitTypeId: g.unitTypeId }))}
        </div>

        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl border border-border bg-card" />)}
          </div>
        ) : isError ? (
          <p className="text-muted-foreground">Impossible de charger les actualités pour le moment.</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Newspaper className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Aucune actualité pour cette sélection.</p>
          </div>
        ) : (
          <>
            {featured && <FeaturedCard post={featured} />}
            {gridItems.length > 0 && (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {gridItems.map((post) => <NewsCard key={post.slug} post={post} />)}
              </div>
            )}

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
