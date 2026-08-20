import { Link, useParams } from 'react-router'
import { PageHero } from '@/components/public/page-hero'
import { RichContent } from '@/components/public/rich-content'
import { usePublicPage, usePublicPages, type PublicPageNav } from '@/services/page-service'
import { Seo } from '@/components/public/seo'
import { cn, metaFromHtml } from '@/lib/utils'

// Standalone CMS page at /p/:slug. If the page belongs to a section (top-level page with sub-pages),
// a side nav of that section is shown.
export default function PublicStandalonePage() {
  const { slug } = useParams()
  const { data: page, isLoading, isError } = usePublicPage(slug)
  const { data: tree } = usePublicPages()

  // Find the section (top-level ancestor) this slug belongs to, for the side nav.
  let section: PublicPageNav | undefined
  for (const top of tree ?? []) {
    if (top.slug === slug || top.children.some((c) => c.slug === slug)) { section = top; break }
  }
  const hasSideNav = section && section.children.length > 0

  if (isLoading) {
    return (<><PageHero title="Chargement…" /><section className="mx-auto max-w-3xl px-4 py-16 sm:px-6"><div className="h-64 animate-pulse rounded-2xl border border-border bg-card" /></section></>)
  }
  if (isError || !page) {
    return (<><PageHero title="Page introuvable" /><section className="mx-auto max-w-3xl px-4 py-16 sm:px-6"><p className="text-muted-foreground">Cette page n'existe pas ou n'est pas publiée.</p><Link to="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Retour à l'accueil</Link></section></>)
  }

  return (
    <>
      <Seo title={page.title} description={metaFromHtml(page.bodyHtml)} />
      <PageHero title={page.title} />
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className={cn('grid gap-10', hasSideNav && 'lg:grid-cols-4')}>
          {hasSideNav && (
            <aside className="lg:col-span-1">
              <nav className="flex flex-col gap-1 lg:sticky lg:top-24">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section!.title}</p>
                <Link to={`/p/${section!.slug}`} className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', section!.slug === slug ? 'bg-accent/10 text-primary' : 'text-foreground/70 hover:bg-accent/5 hover:text-foreground')}>{section!.title}</Link>
                {section!.children.map((c) => (
                  <Link key={c.slug} to={`/p/${c.slug}`} className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', c.slug === slug ? 'bg-accent/10 text-primary' : 'text-foreground/70 hover:bg-accent/5 hover:text-foreground')}>{c.title}</Link>
                ))}
              </nav>
            </aside>
          )}
          <div className={cn(hasSideNav && 'lg:col-span-3')}>
            {/* CMS body — author HTML, sanitized by RichContent (DOMPurify) before render */}
            <RichContent html={page.bodyHtml} />
          </div>
        </div>
      </section>
    </>
  )
}
