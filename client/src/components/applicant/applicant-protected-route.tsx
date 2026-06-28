import { Navigate, Outlet, Link, useNavigate } from 'react-router'
import { Compass, LogOut } from 'lucide-react'
import { Toaster } from 'sonner'
import { useApplicantStore } from '@/stores/applicant-store'
import { Button } from '@/components/ui/button'

// ROLE: layout + auth gate for the signed-in applicant portal (/inscription/*).
// Uses the ISOLATED applicant JWT (applicant claim) — never touches the User/Member
// auth store or app permissions. Redirects to the applicant login when unauthenticated.
// Mounts its own Sonner <Toaster> (the portal lives outside AppLayout, so without this
// every portal toast fired into the void — the "Soumettre did nothing" silent-toast bug).
export function ApplicantProtectedRoute() {
  const isAuthenticated = useApplicantStore((s) => s.isAuthenticated)
  const logout = useApplicantStore((s) => s.logout)
  const navigate = useNavigate()

  if (!isAuthenticated) return <Navigate to="/inscription/login" replace />

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/85 px-4 backdrop-blur-md sm:px-6">
        <Link to="/inscription/portail" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-white shadow-sm ring-1 ring-white/10">
            <Compass className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-tight">GNDJ Scout</span>
            <span className="text-[11px] font-medium text-muted-foreground">Demande d'inscription</span>
          </div>
        </Link>
        <Button variant="ghost" size="sm" onClick={() => { logout(); navigate('/inscription/login') }}>
          <LogOut className="mr-2 h-4 w-4" />Déconnexion
        </Button>
      </header>
      <main className="mx-auto max-w-4xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
