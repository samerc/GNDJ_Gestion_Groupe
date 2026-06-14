import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Newspaper, Calendar } from 'lucide-react'
import { PageHero } from '@/components/public/page-hero'
import { usePublicNews } from '@/services/news-service'

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PublicNewsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = usePublicNews(page, 12)

  return (
    <>
      <PageHero title="Actualités" subtitle="Les dernières nouvelles et événements du groupe." />
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl border border-border bg-card" />)}
          </div>
        ) : isError ? (
          <p className="text-muted-foreground">Impossible de charger les actualités pour le moment.</p>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Newspaper className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Aucune actualité pour le moment. Revenez bientôt !</p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((post) => (
                <Link
                  key={post.slug}
                  to={`/actualites/${post.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:shadow-elevated hover:-translate-y-0.5"
                >
                  <div className="flex h-40 items-center justify-center bg-gradient-to-br from-primary/15 to-accent/15">
                    <Newspaper className="h-9 w-9 text-primary/40" />
                  </div>
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
              ))}
            </div>

            {data.totalPages > 1 && (
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
