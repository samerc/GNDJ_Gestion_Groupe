import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { usePublicSiteConfig } from '@/services/public-service'
import { SupportNote } from '@/components/support-note'
import { GROUP_NAME } from '@/lib/constants'
import gndjLogo from '@/assets/gndj-logo.png'

// ROLE: branded shell for the "Espace membres" sign-in pages (/login, mot de passe / identifiant oublié,
// reset/activation). Two-pane card: a constant branding pane (GNDJ logo + title; stacks on top on mobile) and
// the interactive pane on the right, then the light footer (support line, back to the site, copyright).
// The applicant portal has its own, visually distinct shell (components/applicant/applicant-auth-shell.tsx).
export function MemberAuthShell({
  title,
  subtitle = 'pour accéder à votre espace membres',
  footerExtra,
  children,
}: {
  title: string
  subtitle?: string | null
  // Optional extra footer line(s) shown above the support note (e.g. the enrollment cross-link on /login).
  footerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  const { data: config } = usePublicSiteConfig()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      {/* Decorative backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-md md:max-w-3xl">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-elevated md:flex">
          {/* LEFT — branding: the GNDJ logo on a white tile (readable in BOTH light and dark themes). */}
          <div className="flex flex-col items-center justify-center border-b bg-muted/30 p-6 text-center md:w-2/5 md:border-b-0 md:border-r md:p-8">
            <div className="mb-4 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
              <img src={gndjLogo} alt={`GNDJ — ${GROUP_NAME}`} className="w-32 md:w-40" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>

          {/* RIGHT — the page's own content (form, chooser, result). */}
          <div className="flex-1 p-6 md:p-8">{children}</div>
        </div>

        {/* Light footer under the card (plain links, not floating boxes). */}
        <div className="mt-6 space-y-2">
          {footerExtra}

          {/* Help line for members/parents who can't log in (configurable via demande.support_email). */}
          <SupportNote email={config?.supportEmail} />

          {/* Back to the public site + copyright, one compact line. */}
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-1 text-center text-xs text-muted-foreground">
            <Link to="/" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour au site
            </Link>
            <span className="text-muted-foreground/50">·</span>
            <span>© {new Date().getFullYear()} {GROUP_NAME}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
