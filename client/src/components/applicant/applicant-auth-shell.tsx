import { Compass } from 'lucide-react'
import { Toaster } from 'sonner'

// ROLE: branded centered card shell for the UNAUTHENTICATED applicant pages
// (register / login / verify-email). Mounts its own Sonner <Toaster> — same
// silent-toast fix as ApplicantProtectedRoute, since these pages live outside AppLayout.
export function ApplicantAuthShell({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      <Toaster richColors position="top-center" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-elevated ring-1 ring-white/10">
            <Compass className="h-7 w-7" strokeWidth={2.2} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">GNDJ Scout</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle ?? "Demande d'inscription"}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
