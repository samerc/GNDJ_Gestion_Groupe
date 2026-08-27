import { Navigate, Link } from 'react-router'
import { Compass, UserPlus, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { usePublicSiteConfig } from '@/services/public-service'
import { LoginForm } from '@/components/auth/login-form'

// "Espace membres" — login screen for existing members/chefs (JWT auth).
// Anonymous-only: an already-authenticated user is bounced to /dashboard.
// When enrollment is open it also offers a link into the public inscription portal.
export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { data: config } = usePublicSiteConfig()
  // inscriptionsOpen mirrors the demande.enabled setting — gates the "Demande d'inscription" CTA below.
  const inscriptionsOpen = config?.inscriptionsOpen ?? false

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      {/* Decorative backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-elevated ring-1 ring-white/10">
            <Compass className="h-7 w-7" strokeWidth={2.2} />
          </div>
          <span className="mb-1 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
            Membres
          </span>
          <h1 className="text-3xl font-bold tracking-tight">Espace membres</h1>
          <p className="mt-1 text-sm text-muted-foreground">Réservé aux membres déjà inscrits</p>
        </div>
        <LoginForm />
        {/* Cross-link for parents who want to enroll a child (only while enrollment is open). Accent-tinted
            to echo the distinct teal theme of the "Demande d'inscription" space. */}
        {inscriptionsOpen && (
          <Link
            to="/inscription"
            className="mt-6 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm transition-colors hover:bg-accent/15"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <UserPlus className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-muted-foreground">Vous souhaitez inscrire un enfant&nbsp;?</span>
              <span className="block font-medium text-accent">Demande d'inscription →</span>
            </span>
          </Link>
        )}
        {/* Back to the public group site (this page is outside the public shell, so there's no header nav). */}
        <Link to="/" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour au site
        </Link>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Groupe Notre Dame - Jamhour — Tous droits réservés
        </p>
      </div>
    </div>
  )
}
