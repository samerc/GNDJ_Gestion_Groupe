// "Aide": the guides this user may read (member → CU → CG → admin → technical), searchable, each with a table of
// contents and a print/PDF view. /aide lists them; /aide/:slug opens one (a #anchor scrolls to a section).
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { BookOpen, ChevronLeft, Printer, Search, X } from 'lucide-react'
import {
  AUDIENCE_LABELS, headingId, useHelpDoc, useHelpList, useHelpSearch, type HelpAudience, type HelpDocSummary,
} from '@/services/help-service'
import { MarkdownView } from '@/components/help/markdown-view'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks/use-debounce'
import apiClient from '@/lib/api-client'
import { cn } from '@/lib/utils'

const ORDER: HelpAudience[] = ['public', 'member', 'cu', 'cg', 'admin', 'dev']

function GuideList({ docs, active }: { docs: HelpDocSummary[]; active?: string }) {
  return (
    <nav className="space-y-4">
      {ORDER.filter((a) => docs.some((d) => d.audience === a)).map((a) => (
        <div key={a}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{AUDIENCE_LABELS[a]}</p>
          <ul className="space-y-0.5">
            {docs.filter((d) => d.audience === a).map((d) => (
              <li key={d.slug}>
                <Link
                  to={`/aide/${d.slug}`}
                  className={cn('block rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                    active === d.slug && 'bg-primary/10 font-medium text-primary')}
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SearchResults({ q }: { q: string }) {
  const { data, isFetching } = useHelpSearch(q)
  if (isFetching && !data) return <LoadingSpinner />
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">Aucun résultat pour « {q} ».</p>
  return (
    <ul className="space-y-2">
      {data.map((h, i) => (
        <li key={i}>
          <Link to={`/aide/${h.slug}#${headingId(h.section)}`} className="block rounded-lg border p-3 hover:bg-muted">
            <div className="text-sm font-medium">{h.section}</div>
            <div className="text-xs text-muted-foreground">{h.title}</div>
            <p className="mt-1 text-sm text-foreground/80">{h.snippet}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function GuideView({ slug }: { slug: string }) {
  const { data, isLoading, isError } = useHelpDoc(slug)
  const { hash } = useLocation()
  const [ready, setReady] = useState(false)

  // Scroll to the #section once the article (with its images/diagrams) has rendered.
  useEffect(() => {
    if (!ready || !hash) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [ready, hash])

  if (isLoading) return <LoadingSpinner variant="detail" />
  if (isError || !data) return <EmptyState icon={BookOpen} title="Guide introuvable" description="Ce guide n'existe pas ou ne vous est pas destiné." />

  const sections = [...data.markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <article className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="xl:hidden"><Link to="/aide"><ChevronLeft className="mr-1 h-4 w-4" />Tous les guides</Link></Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => window.open(`/aide/imprimer/${slug}`, '_blank')}>
            <Printer className="mr-1 h-4 w-4" />Imprimer / PDF
          </Button>
        </div>
        <Card><CardContent className="p-5 sm:p-8">
          <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">{data.title}</h1>
          {data.summary && <p className="mb-6 text-muted-foreground">{data.summary}</p>}
          <MarkdownView markdown={data.markdown} client={apiClient} onReady={() => setReady(true)} />
        </CardContent></Card>
      </article>
      {sections.length > 2 && (
        <aside className="hidden w-60 shrink-0 xl:sticky xl:top-20 xl:block">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sommaire</p>
          <ul className="space-y-1 border-l pl-3 text-sm">
            {sections.map((s) => (
              <li key={s}><a href={`#${headingId(s)}`} className="text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.preventDefault(); document.getElementById(headingId(s))?.scrollIntoView({ behavior: 'smooth' }) }}>{s}</a></li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  )
}

export default function HelpPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { data: docs, isLoading } = useHelpList()
  const [query, setQuery] = useState('')
  const q = useDebounce(query, 300)

  // /aide with a single guide available (a plain member) → open it directly.
  useEffect(() => {
    if (!slug && docs?.length === 1) navigate(`/aide/${docs[0].slug}`, { replace: true })
  }, [slug, docs, navigate])

  return (
    <Page>
      <PageHeader title="Aide" icon={BookOpen} description="Les guides d'utilisation de la plateforme, selon votre rôle." />
      {isLoading ? <LoadingSpinner variant="table" /> : !docs || docs.length === 0 ? (
        <EmptyState icon={BookOpen} title="Aucun guide disponible" />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Left: search + guide list (on a phone it is shown only on /aide, not inside a guide). */}
          {/* Hidden inside a guide when it's the only one (nothing to choose; the article gets the room). */}
          <aside className={cn('w-full shrink-0 space-y-4 lg:sticky lg:top-20 lg:w-64', slug && 'hidden lg:block', slug && docs.length === 1 && 'lg:hidden')}>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher dans l'aide…" className="pl-8 pr-8" />
              {query && (
                <button type="button" aria-label="Effacer" onClick={() => setQuery('')} className="absolute right-2 top-2.5 text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <GuideList docs={docs} active={slug} />
          </aside>

          <div className="min-w-0 flex-1">
            {q.trim().length >= 2 ? <SearchResults q={q} />
              : slug ? <GuideView key={slug} slug={slug} />
              : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {docs.map((d) => (
                    <Link key={d.slug} to={`/aide/${d.slug}`}>
                      <Card className="h-full transition-colors hover:bg-muted/50"><CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{AUDIENCE_LABELS[d.audience]}</p>
                        <p className="mt-1 font-semibold">{d.title}</p>
                        {d.summary && <p className="mt-1 text-sm text-muted-foreground">{d.summary}</p>}
                      </CardContent></Card>
                    </Link>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}
    </Page>
  )
}
