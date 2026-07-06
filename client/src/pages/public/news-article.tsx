import { Link, useParams } from 'react-router'
import { ArrowLeft, Calendar, Paperclip, FileText, Download } from 'lucide-react'
import { PageHero } from '@/components/public/page-hero'
import { RichContent } from '@/components/public/rich-content'
import { usePublicNewsArticle } from '@/services/news-service'
import { formatDateLong as formatDate } from '@/lib/utils'

// Public single-article page at `/actualites/:slug` — anonymous. Fetches one published post by
// slug; shows loading/not-found fallbacks, then header (date + tag) and the CMS body.
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

        {/* Cover image (when set) — sits above the body */}
        {article.coverImagePath && (
          <img src={article.coverImagePath} alt="" loading="lazy"
            className="mt-8 aspect-[16/9] w-full rounded-2xl border border-border object-cover shadow-card" />
        )}

        {/* Article body — author HTML, sanitized by RichContent (DOMPurify) before render */}
        <RichContent html={article.bodyHtml} className="mt-8" />

        {/* Downloadable attachments (PDF/images) */}
        {article.attachments.length > 0 && (
          <div className="mt-10 border-t border-border pt-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Paperclip className="h-5 w-5 text-accent" /> Pièces jointes
            </h2>
            <ul className="mt-4 space-y-2">
              {article.attachments.map((a, i) => (
                <li key={i}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" download={a.name}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elevated">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </>
  )
}
