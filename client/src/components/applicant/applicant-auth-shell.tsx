import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Toaster } from 'sonner'
import { useApplicantConfig } from '@/services/applicant-service'
import { SupportNote } from '@/components/support-note'
import gndjLogo from '@/assets/gndj-logo.png'

// ROLE: branded centered shell for the UNAUTHENTICATED applicant pages (register / login / verify /
// forgot / reset / invitation). Mounts its own Sonner <Toaster> — same silent-toast fix as
// ApplicantProtectedRoute, since these pages live outside AppLayout.
//
// Matches the member /login branding language (GNDJ logo on a white tile + light plain-link footer) but stays
// visually DISTINCT: the ACCENT (teal) colour + a "Nouveau membre" pill + the title "Demande d'inscription",
// so a parent never confuses the two nearly-identical login screens. (The saved-accounts chooser + two-pane
// card of the member login are member-specific and deliberately not applied here.)
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
        <div className="mb-6 flex flex-col items-center text-center">
          {/* GNDJ logo on a white tile (readable in light + dark; its own background is white so it blends). */}
          <div className="mb-4 rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
            <img src={gndjLogo} alt="GNDJ — Groupe Notre-Dame Jamhour" className="w-28" />
          </div>
          <span className="mb-1 rounded-full bg-accent/15 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
            Nouveau membre
          </span>
          <h1 className="text-3xl font-bold tracking-tight">Demande d'inscription</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle ?? "Inscrire un enfant au groupe — GNDJ Scout"}</p>
        </div>

        {children}

        {/* Light footer — plain links (consistent with the member login footer), not bordered boxes. */}
        <div className="mt-6 space-y-2">
          {/* Help line for parents who hit a login/registration problem (configurable via demande.support_email). */}
          <SupportNote email={config?.supportEmail} />

          {/* Cross-link for anyone who is actually an existing member/chef. */}
          <p className="text-center text-sm text-muted-foreground">
            Vous êtes déjà membre ou chef&nbsp;?{' '}
            <Link to="/login" className="font-medium text-primary underline-offset-2 hover:underline">Espace membres →</Link>
          </p>

          {/* Back to the public group site + copyright, one compact line. */}
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
