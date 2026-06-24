import { Navigate, Link } from 'react-router'
import { Compass, UserPlus } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { usePublicSiteConfig } from '@/services/public-service'
import { LoginForm } from '@/components/auth/login-form'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { data: config } = usePublicSiteConfig()
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
          <h1 className="text-3xl font-bold tracking-tight">Espace membres</h1>
          <p className="mt-1 text-sm text-muted-foreground">Connexion réservée aux membres du groupe — GNDJ Scout</p>
        </div>
        <LoginForm />
        {inscriptionsOpen && (
          <>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button asChild variant="outline" className="mt-4 w-full">
              <Link to="/inscription"><UserPlus className="mr-2 h-4 w-4" />Demande d'inscription (nouveau membre)</Link>
            </Button>
          </>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} GNDJ Scout — Tous droits réservés
        </p>
      </div>
    </div>
  )
}
