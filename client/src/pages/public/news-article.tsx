import { Link, useParams } from 'react-router'
import { ArrowLeft, Calendar } from 'lucide-react'
import { PageHero } from '@/components/public/page-hero'
import { RichContent } from '@/components/public/rich-content'
import { usePublicNewsArticle } from '@/services/news-service'

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PublicNewsArticlePage() {
  const { slug } = useParams()
  const { data: article, isLoading, isError } = usePublicNewsArticle(slug)

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

  if (isError || !article) {
    return (
      <>
        <PageHero title="Article introuvable" />
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <p className="text-muted-foreground">Cet article n'existe pas ou n'est pas publié.</p>
          <Link to="/actualites" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Retour aux actualités
          </Link>
        </section>
      </>
    )
  }

  return (
    <>
      <PageHero title={article.title} />
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/actualites" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Toutes les actualités
          </Link>
          <span className="inline-flex items-center gap-2 text-sm">
            {article.publishedAt && <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-4 w-4" /> {formatDate(article.publishedAt)}</span>}
            <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">{article.tagLabel}</span>
          </span>
        </div>

        <RichContent html={article.bodyHtml} className="mt-8" />
      </article>
    </>
  )
}
