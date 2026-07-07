import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { Toaster } from 'sonner'
import { Compass, Menu, X, ArrowRight, ChevronDown, MapPin, Mail, Phone, ArrowUp } from 'lucide-react'

// Instagram/Facebook brand glyphs (lucide dropped its brand icons) — module-scope so their identity is stable.
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}
function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}
import { cn } from '@/lib/utils'
import { usePublicPages } from '@/services/page-service'
import { usePublicSiteConfig } from '@/services/public-service'

const FIXED_LEFT = [{ to: '/', label: 'Accueil', end: true }]
// A fixed nav entry is either a direct link (to) or a group with a hover dropdown (children).
// Actualités (news) + Agenda (events) are grouped under one "Actualités" entry.
type FixedNav = { label: string; to?: string; children?: { to: string; label: string }[] }
const FIXED_RIGHT: FixedNav[] = [
  { to: '/unites', label: 'Unités' },
  { label: 'Actualités', children: [
    { to: '/actualites', label: 'Actualités' },
    { to: '/agenda', label: 'Agenda' },
  ] },
  { to: '/ressources', label: 'Ressources' },
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

// ROLE: shell for the anonymous public site (home, /unites, /actualites, /p/:slug, /contact).
// Scroll-aware sticky header, nav built dynamically from CMS pages, and a footer.
// Mounts its own Sonner <Toaster> (public site lives outside AppLayout). The
// "Demande d'inscription" CTA only appears when inscriptions are open.
export function PublicLayout() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: pages } = usePublicPages()
  const { data: config } = usePublicSiteConfig()
  const inscriptionsOpen = config?.inscriptionsOpen ?? false

  // Solidify the header background once the page is scrolled past the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lock body scroll while the mobile menu overlay is open (menu itself stays scrollable).
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
      <Toaster richColors position="top-center" />
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
            {FIXED_RIGHT.map((item) =>
              item.children ? (
                <div key={item.label} className="group relative">
                  <button className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground hover:bg-accent/10">
                    {item.label} <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <div className="invisible absolute left-0 top-full z-50 min-w-44 rounded-xl border border-border bg-card p-1.5 opacity-0 shadow-elevated transition-all group-hover:visible group-hover:opacity-100">
                    {item.children.map((c) => (
                      <NavLink key={c.to} to={c.to} className={({ isActive }) => cn('block rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent/10', isActive ? 'text-primary' : 'text-foreground/80')}>{c.label}</NavLink>
                    ))}
                  </div>
                </div>
              ) : (
                <NavLink key={item.to} to={item.to!} className={navLinkClass}>{item.label}</NavLink>
              )
            )}
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
          <div className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-border bg-background lg:hidden">
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
              {FIXED_RIGHT.flatMap((item) => item.children ?? [{ to: item.to!, label: item.label }]).map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => cn('rounded-lg px-3 py-2.5 text-base font-medium', isActive ? 'bg-accent/10 text-primary' : 'text-foreground/80 hover:bg-accent/10')}>{item.label}</NavLink>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
                <Link to="/login" onClick={() => setMobileOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-center text-sm font-medium">Espace membres</Link>
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

      <PublicFooter footer={config?.content.footer} address={config?.content.contact.address} inscriptionsOpen={inscriptionsOpen} />
    </div>
  )
}

// Footer: identity + how to reach/join the group. The old "Naviguer" column just re-listed the header nav
// (redundant) and has been dropped — the footer now focuses on the brand, real contact details, and the two
// membership actions. Contact/email/phone come from the editable site.content (Textes du site).
type FooterContent = { tagline?: string; instagram?: string; facebook?: string; email?: string; phone?: string }
function PublicFooter({ footer, address, inscriptionsOpen }: { footer?: FooterContent; address?: string; inscriptionsOpen: boolean }) {
  const tagline = footer?.tagline ?? "Le Groupe Notre-Dame Jamhour, au service de la jeunesse du Liban depuis 1935."
  const { instagram, facebook, email, phone } = footer ?? {}
  const hasContact = !!(address || email || phone)

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand + tagline + social */}
        <div className="lg:col-span-2">
          <Brand />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">{tagline}</p>
          {(instagram || facebook) && (
            <div className="mt-5 flex items-center gap-3">
              {instagram && (
                <a href={instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary hover:-translate-y-0.5">
                  <InstagramIcon />
                </a>
              )}
              {facebook && (
                <a href={facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary hover:-translate-y-0.5">
                  <FacebookIcon />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Contact — real coordinates (shown only when configured), plus the contact form */}
        <div>
          <h3 className="text-sm font-semibold">Contact</h3>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {address && (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                <span className="whitespace-pre-line leading-relaxed">{address}</span>
              </li>
            )}
            {email && (
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-primary/60" />
                <a href={`mailto:${email}`} className="break-all transition-colors hover:text-foreground">{email}</a>
              </li>
            )}
            {phone && (
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-primary/60" />
                <a href={`tel:${phone.replace(/\s+/g, '')}`} className="transition-colors hover:text-foreground">{phone}</a>
              </li>
            )}
            <li className={hasContact ? 'pt-1' : ''}>
              <Link to="/contact" className="font-medium text-primary transition-colors hover:text-primary/80">Formulaire de contact →</Link>
            </li>
          </ul>
        </div>

        {/* Rejoindre — the two membership actions */}
        <div>
          <h3 className="text-sm font-semibold">Rejoindre</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            {inscriptionsOpen && (
              <li><Link to="/inscription" className="transition-colors hover:text-foreground">Demande d'inscription</Link></li>
            )}
            <li><Link to="/login" className="transition-colors hover:text-foreground">Espace membres</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Groupe Notre-Dame Jamhour. Tous droits réservés.</p>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
            Retour en haut <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </footer>
  )
}
