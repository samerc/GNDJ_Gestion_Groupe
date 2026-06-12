import { Navigate } from 'react-router'
import { Compass } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
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
          <h1 className="text-3xl font-bold tracking-tight">GNDJ Scout</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plateforme de gestion de groupe scout</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} GNDJ Scout — Tous droits réservés
        </p>
      </div>
    </div>
  )
}
