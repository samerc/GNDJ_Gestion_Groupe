import { Navigate, Outlet, Link, useNavigate } from 'react-router'
import { LogOut, BookOpen } from 'lucide-react'
import { BrandMark } from '@/components/shared/brand-mark'
import { useApplicantStore } from '@/stores/applicant-store'
import { Button } from '@/components/ui/button'

// ROLE: layout + auth gate for the signed-in applicant portal (/inscription/*).
// Uses the ISOLATED applicant JWT (applicant claim) — never touches the User/Member
// auth store or app permissions. Redirects to the applicant login when unauthenticated.
// Toasts use the single app-wide <Toaster> mounted in main.tsx (one per layout used to leave gaps).
export function ApplicantProtectedRoute() {
  const isAuthenticated = useApplicantStore((s) => s.isAuthenticated)
  const logout = useApplicantStore((s) => s.logout)
  const navigate = useNavigate()

  if (!isAuthenticated) return <Navigate to="/inscription/login" replace />

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/85 px-4 backdrop-blur-md sm:px-6">
        <Link to="/inscription/portail" className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-tight">GNDJ Scout</span>
            <span className="text-[11px] font-medium text-muted-foreground">Demande d'inscription</span>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          {/* The public step-by-step enrolment guide (docs/help/guide-inscription.md). */}
          <Button asChild variant="ghost" size="sm">
            <Link to="/guide/guide-inscription" target="_blank"><BookOpen className="mr-2 h-4 w-4" />Aide</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { logout(); navigate('/inscription/login') }}>
            <LogOut className="mr-2 h-4 w-4" />Déconnexion
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
