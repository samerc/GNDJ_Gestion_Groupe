import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { Compass, Menu, X, ArrowRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePublicPages } from '@/services/page-service'
import { usePublicSiteConfig } from '@/services/public-service'

const FIXED_LEFT = [{ to: '/', label: 'Accueil', end: true }]
const FIXED_RIGHT = [
  { to: '/unites', label: 'Unités' },
  { to: '/actualites', label: 'Actualités' },
  { to: '/contact', label: 'Contact' },
]

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-sm ring-1 ring-white/10">
        <Compass className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap text-base font-bold tracking-tight">Notre-Dame Jamhour</span>
        <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Groupe scout · GNDJ</span>
      </span>
    </Link>
  )
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn('whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'text-primary' : 'text-foreground/70 hover:text-foreground hover:bg-accent/10')

export function PublicLayout() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: pages } = usePublicPages()
  const { data: config } = usePublicSiteConfig()
  const inscriptionsOpen = config?.inscriptionsOpen ?? false

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  const topPages = pages ?? []
  // Keep the bar from overflowing: show the first few top-level pages inline, collapse the rest
  // into a "Plus" dropdown. (Sub-pages always live under their parent's dropdown.)
  const MAX_INLINE_PAGES = 5
  const inlinePages = topPages.slice(0, MAX_INLINE_PAGES)
  const overflowPages = topPages.slice(MAX_INLINE_PAGES)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className={cn('sticky top-0 z-50 border-b transition-all duration-300',
        scrolled ? 'border-border bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70'
          : 'border-transparent bg-background/60 backdrop-blur-sm')}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />

          <nav className="hidden items-center gap-1 lg:flex">
            {FIXED_LEFT.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>{item.label}</NavLink>
            ))}
            {inlinePages.map((p) =>
              p.children.length > 0 ? (
                <div key={p.slug} className="group relative">
                  <button className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground hover:bg-accent/10">
                    {p.title} <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <div className="invisible absolute left-0 top-full z-50 min-w-48 rounded-xl border border-border bg-card p-1.5 opacity-0 shadow-elevated transition-all group-hover:visible group-hover:opacity-100">
                    <Link to={`/p/${p.slug}`} className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent/10">{p.title}</Link>
                    <div className="my-1 border-t border-border" />
                    {p.children.map((c) => (
                      <Link key={c.slug} to={`/p/${c.slug}`} className="block rounded-lg px-3 py-2 text-sm text-foreground/80 hover:bg-accent/10">{c.title}</Link>
                    ))}
                  </div>
                </div>
              ) : (
                <NavLink key={p.slug} to={`/p/${p.slug}`} className={navLinkClass}>{p.title}</NavLink>
              )
            )}
            {overflowPages.length > 0 && (
              <div className="group relative">
                <button className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground hover:bg-accent/10">
                  Plus <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <div className="invisible absolute right-0 top-full z-50 max-h-[70vh] min-w-56 overflow-y-auto rounded-xl border border-border bg-card p-1.5 opacity-0 shadow-elevated transition-all group-hover:visible group-hover:opacity-100">
                  {overflowPages.map((p) => (
                    <div key={p.slug}>
                      <Link to={`/p/${p.slug}`} className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent/10">{p.title}</Link>
                      {p.children.map((c) => (
                        <Link key={c.slug} to={`/p/${c.slug}`} className="block rounded-lg py-1.5 pl-6 pr-3 text-sm text-foreground/70 hover:bg-accent/10">{c.title}</Link>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {FIXED_RIGHT.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>{item.label}</NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <Link to="/login" className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground">Espace membres</Link>
            {inscriptionsOpen && (
              <Link to="/inscription" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:shadow-md hover:brightness-110 active:translate-y-px">
                Demande d'inscription
              </Link>
            )}
          </div>

          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground lg:hidden"
            onClick={() => setMobileOpen((o) => !o)} aria-label="Menu" aria-expanded={mobileOpen}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-border bg-background lg:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6">
              {FIXED_LEFT.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => cn('rounded-lg px-3 py-2.5 text-base font-medium', isActive ? 'bg-accent/10 text-primary' : 'text-foreground/80 hover:bg-accent/10')}>{item.label}</NavLink>
              ))}
              {topPages.map((p) => (
                <div key={p.slug}>
                  <Link to={`/p/${p.slug}`} onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2.5 text-base font-medium text-foreground/80 hover:bg-accent/10">{p.title}</Link>
                  {p.children.map((c) => (
                    <Link key={c.slug} to={`/p/${c.slug}`} onClick={() => setMobileOpen(false)} className="block rounded-lg py-2 pl-7 pr-3 text-sm text-foreground/70 hover:bg-accent/10">{c.title}</Link>
                  ))}
                </div>
              ))}
              {FIXED_RIGHT.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => cn('rounded-lg px-3 py-2.5 text-base font-medium', isActive ? 'bg-accent/10 text-primary' : 'text-foreground/80 hover:bg-accent/10')}>{item.label}</NavLink>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
                <Link to="/login" onClick={() => setMobileOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-center text-sm font-medium">Espace membres et chefs</Link>
                {inscriptionsOpen && (
                  <Link to="/inscription" onClick={() => setMobileOpen(false)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground">
                    Demande d'inscription <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1"><Outlet /></main>

      <PublicFooter pages={topPages} tagline={config?.content.footer.tagline} />
    </div>
  )
}

function PublicFooter({ pages, tagline }: { pages: { slug: string; title: string }[]; tagline?: string }) {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Brand />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {tagline ?? "Le Groupe Notre-Dame Jamhour, au service de la jeunesse du Liban depuis 1935."}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Naviguer</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            <li><Link to="/" className="transition-colors hover:text-foreground">Accueil</Link></li>
            <li><Link to="/unites" className="transition-colors hover:text-foreground">Unités</Link></li>
            <li><Link to="/actualites" className="transition-colors hover:text-foreground">Actualités</Link></li>
            <li><Link to="/contact" className="transition-colors hover:text-foreground">Contact</Link></li>
            {pages.slice(0, 4).map((p) => (
              <li key={p.slug}><Link to={`/p/${p.slug}`} className="transition-colors hover:text-foreground">{p.title}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Rejoindre</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            <li><Link to="/inscription" className="transition-colors hover:text-foreground">Demande d'inscription</Link></li>
            <li><Link to="/login" className="transition-colors hover:text-foreground">Espace membres et chefs</Link></li>
            <li><Link to="/contact" className="transition-colors hover:text-foreground">Nous contacter</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Groupe Notre-Dame Jamhour. Tous droits réservés.</p>
          <p>Au service de la jeunesse du Liban depuis 1935.</p>
        </div>
      </div>
    </footer>
  )
}
