import { Link, useParams } from 'react-router'
import { ArrowLeft, FileText, Download } from 'lucide-react'
import { PageHero } from '@/components/public/page-hero'
import { RichContent } from '@/components/public/rich-content'
import { usePublicResource, categoryLabel } from '@/services/resources-service'
import { Seo } from '@/components/public/seo'
import { metaFromHtml } from '@/lib/utils'

function isAudio(url: string) { return /\.mp3($|\?)/i.test(url) }

// Public single-resource page at `/ressources/:slug` — anonymous. Fetches one published resource by slug;
// shows loading/not-found fallbacks, the CMS body, and attachments (audio players for mp3, download links
// for the rest).
export default function PublicResourcePage() {
  const { slug } = useParams()
  const { data: r, isLoading, isError } = usePublicResource(slug)

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

  if (isError || !r) {
    return (
      <>
        <PageHero title="Ressource introuvable" />
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <p className="text-muted-foreground">Cette ressource n'existe pas ou n'est pas publiée.</p>
          <Link to="/ressources" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Retour aux ressources
          </Link>
        </section>
      </>
    )
  }

  const tags = (r.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const audios = r.attachments.filter((a) => isAudio(a.url))
  const files = r.attachments.filter((a) => !isAudio(a.url))

  return (
    <>
      <Seo title={r.title} description={metaFromHtml(r.bodyHtml) ?? `${r.title} — ${categoryLabel(r.category)}, Groupe Notre-Dame de Jamhour.`} />
      <PageHero title={r.title} />
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/ressources" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Toutes les ressources
          </Link>
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">{categoryLabel(r.category)}</span>
        </div>

        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tags.map((t) => <span key={t} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">{t}</span>)}
          </div>
        )}

        {r.coverImagePath && (
          <img src={r.coverImagePath} alt="" loading="lazy"
            className="mt-8 aspect-[16/9] w-full rounded-2xl border border-border object-cover shadow-card" />
        )}

        {/* Audio players (mp3 attachments) */}
        {audios.length > 0 && (
          <div className="mt-8 space-y-3">
            {audios.map((a, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="mb-2 text-sm font-medium">{a.name}</p>
                <audio controls preload="none" src={a.url} className="w-full">Votre navigateur ne prend pas en charge la lecture audio.</audio>
              </div>
            ))}
          </div>
        )}

        {/* Body — author HTML, sanitized by RichContent (DOMPurify) before render */}
        <RichContent html={r.bodyHtml} className="mt-8" />

        {/* Downloadable files (PDF/images/other) */}
        {files.length > 0 && (
          <div className="mt-10 border-t border-border pt-6">
            <h2 className="text-lg font-semibold tracking-tight">Fichiers</h2>
            <ul className="mt-4 space-y-2">
              {files.map((a, i) => (
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
