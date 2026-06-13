import { Link, Navigate } from 'react-router'
import { Compass, Users, UserPlus, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card } from '@/components/ui/card'

// Public entry page: choose the members/chefs space or the public inscription portal.
// (Placeholder for the future full group site — news, units, resources.)
export default function LandingPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative z-10 w-full max-w-2xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-elevated ring-1 ring-white/10">
            <Compass className="h-8 w-8" strokeWidth={2.2} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">GNDJ Scout</h1>
          <p className="mt-2 text-muted-foreground">Plateforme du groupe scout</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/login" className="group">
            <Card className="flex h-full flex-col gap-3 p-6 transition-all hover:shadow-elevated hover:-translate-y-0.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Espace membres et chefs</h2>
                <p className="text-sm text-muted-foreground">Connexion pour les membres, chefs d'unité et l'administration.</p>
              </div>
              <span className="mt-auto inline-flex items-center text-sm font-medium text-primary">
                Se connecter <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Card>
          </Link>

          <Link to="/inscription" className="group">
            <Card className="flex h-full flex-col gap-3 p-6 transition-all hover:shadow-elevated hover:-translate-y-0.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <UserPlus className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Demande d'inscription</h2>
                <p className="text-sm text-muted-foreground">Nouveau ? Présentez une demande pour rejoindre le mouvement.</p>
              </div>
              <span className="mt-auto inline-flex items-center text-sm font-medium text-accent">
                Commencer <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Card>
          </Link>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} GNDJ Scout — Tous droits réservés
        </p>
      </div>
    </div>
  )
}
