import { useState } from 'react'
import { Navigate, Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { usePublicSiteConfig } from '@/services/public-service'
import { LoginForm } from '@/components/auth/login-form'
import { AccountChooser } from '@/components/auth/account-chooser'
import { SupportNote } from '@/components/support-note'
import { LoginAnnouncement } from '@/components/login-announcement'
import { getDeviceAccounts } from '@/lib/device-accounts'
import gndjLogo from '@/assets/gndj-logo.png'

// "Espace membres" — login screen for existing members/chefs (JWT auth). Anonymous-only: an
// already-authenticated user is bounced to /dashboard.
//
// Google-style two-pane layout: a constant branding pane on the left (GNDJ logo; stacks on top on mobile) and
// an interactive pane on the right that shows either the « Choisir un compte » list (when this device has saved
// accounts) or the sign-in form, with any admin announcement above it. `md:flex` = two columns on desktop, one
// on mobile.
export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { data: config } = usePublicSiteConfig()
  const inscriptionsOpen = config?.inscriptionsOpen ?? false

  // Saved accounts on this device (survives logout). If any, open on the chooser; else straight to the form.
  const [hasAccounts] = useState(() => getDeviceAccounts().length > 0)
  const [view, setView] = useState<'chooser' | 'form'>(hasAccounts ? 'chooser' : 'form')
  const [prefill, setPrefill] = useState('') // username carried from a chosen account with no live session

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const title = view === 'chooser' ? 'Choisir un compte' : 'Se connecter'

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      {/* Decorative backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-md md:max-w-3xl">
        {/* Two-pane card. */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-elevated md:flex">
          {/* LEFT — branding: the GNDJ logo on a white tile (the logo has a white background + dark navy text, so
              a white tile keeps it readable in BOTH light and dark themes). Stacks on top on mobile; vertically
              centered beside the form on desktop. */}
          <div className="flex flex-col items-center justify-center border-b bg-muted/30 p-6 text-center md:w-2/5 md:border-b-0 md:border-r md:p-8">
            <div className="mb-4 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
              <img src={gndjLogo} alt="GNDJ — Groupe Notre-Dame Jamhour" className="w-32 md:w-40" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">pour accéder à votre espace membres</p>
          </div>

          {/* RIGHT — interactive: admin announcement (if any) then the chooser or form. */}
          <div className="flex-1 p-6 md:p-8">
            {config?.loginMessages?.map((m, i) => <LoginAnnouncement key={i} message={m} tone="primary" />)}
            {view === 'chooser' ? (
              <AccountChooser
                onUseAnother={() => { setPrefill(''); setView('form') }}
                onNeedAuth={(username) => { setPrefill(username); setView('form') }}
              />
            ) : (
              <LoginForm
                initialUsername={prefill}
                onBack={hasAccounts ? () => setView('chooser') : undefined}
              />
            )}
          </div>
        </div>

        {/* Light footer under the card (Google-style plain links, not floating boxes). Spans the full card
            width so the lines don't wrap on desktop (still wraps naturally on a narrow phone). */}
        <div className="mt-6 space-y-2">
          {/* Enrollment cross-link for parents (only while enrollment is open). */}
          {inscriptionsOpen && (
            <p className="text-center text-sm text-muted-foreground">
              Vous souhaitez inscrire un enfant&nbsp;?{' '}
              <Link to="/inscription" className="font-medium text-accent underline-offset-2 hover:underline">
                Demande d'inscription →
              </Link>
            </p>
          )}

          {/* Help line for members/parents who can't log in (configurable via demande.support_email). */}
          <SupportNote email={config?.supportEmail} />

          {/* Back to the public site + copyright, one compact line. */}
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-1 text-center text-xs text-muted-foreground">
            <Link to="/" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour au site
            </Link>
            <span className="text-muted-foreground/50">·</span>
            <span>© {new Date().getFullYear()} Groupe Notre-Dame - Jamhour</span>
          </div>
        </div>
      </div>
    </div>
  )
}
