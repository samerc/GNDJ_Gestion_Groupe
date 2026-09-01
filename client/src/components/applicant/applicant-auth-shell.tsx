import { Link } from 'react-router'
import { UserPlus, Compass, ArrowLeft } from 'lucide-react'
import { Toaster } from 'sonner'
import { useApplicantConfig } from '@/services/applicant-service'
import { SupportNote } from '@/components/support-note'

// ROLE: branded centered card shell for the UNAUTHENTICATED applicant pages
// (register / login / verify-email). Mounts its own Sonner <Toaster> — same
// silent-toast fix as ApplicantProtectedRoute, since these pages live outside AppLayout.
//
// Deliberately themed DISTINCTLY from the member /login ("Espace membres"): this space uses the ACCENT
// (teal) colour + an enrollment icon (UserPlus) + the title "Demande d'inscription", so a parent never
// confuses the two nearly-identical login screens. A cross-link to the member espace sits at the bottom
// of every applicant auth page for anyone who landed in the wrong place.
export function ApplicantAuthShell({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  const { data: config } = useApplicantConfig()
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      <Toaster richColors position="top-center" />
      {/* Accent-dominant backdrop (member login is primary/navy-dominant) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/15 via-background to-accent/10" />
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent/70 text-white shadow-elevated ring-1 ring-white/10">
            <UserPlus className="h-7 w-7" strokeWidth={2.2} />
          </div>
          <span className="mb-1 rounded-full bg-accent/15 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
            Nouveau membre
          </span>
          <h1 className="text-3xl font-bold tracking-tight">Demande d'inscription</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle ?? "Inscrire un enfant au groupe — GNDJ Scout"}</p>
        </div>
        {children}

        {/* Help line for parents who hit a login/registration problem (configurable via demande.support_email). */}
        <SupportNote email={config?.supportEmail} />

        {/* Cross-link for anyone who is actually an existing member/chef. */}
        <Link
          to="/login"
          className="mt-6 flex items-center justify-center gap-2 rounded-lg border bg-card/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <Compass className="h-4 w-4 text-primary" />
          Vous êtes déjà membre ? <span className="font-medium text-foreground">Espace membres →</span>
        </Link>

        {/* Back to the public group site (these pages live outside the public shell, so there's no header nav). */}
        <Link to="/" className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour au site
        </Link>
      </div>
    </div>
  )
}
