import { Link, Navigate } from 'react-router'
import { useApplicantStore } from '@/stores/applicant-store'
import { useApplicantConfig } from '@/services/applicant-service'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { CalendarClock } from 'lucide-react'

// Public entry screen for the applicant (parent/future member) portal at /inscription.
// Anonymous: shows the intro + Créer un compte / Se connecter, or a "fermées" notice when
// inscriptions are closed. Already-logged-in applicants are bounced straight to the portail.
// yyyy-MM-dd → "1 septembre 2026" (fr); null/invalid → null.
function frDate(d: string | null | undefined): string | null {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  return isNaN(dt.getTime()) ? null : dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function InscriptionLandingPage() {
  const isAuthenticated = useApplicantStore((s) => s.isAuthenticated)
  const { data: config, isLoading } = useApplicantConfig()

  // Skip the landing for a returning applicant who still has a valid session.
  if (isAuthenticated) return <Navigate to="/inscription/portail" replace />

  // No more separate "choose an option" landing (user request): when inscriptions are OPEN, /inscription goes
  // straight to the login page (which carries the "Créer un compte" button). Only the CLOSED state keeps a
  // notice here (login itself is behind ApplicantOpenRoute, which bounces back here when closed → no loop).
  if (isLoading) {
    return <ApplicantAuthShell><Card className="shadow-elevated"><CardContent className="py-10"><LoadingSpinner /></CardContent></Card></ApplicantAuthShell>
  }
  if (config?.isOpen) return <Navigate to="/inscription/login" replace />

  const opensOn = frDate(config?.submissionStart)   // shown when the portal isn't open yet (future start date)

  return (
    <ApplicantAuthShell>
      <Card className="shadow-elevated">
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CalendarClock className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-lg font-medium">Les inscriptions sont fermées</p>
            <p className="text-sm text-muted-foreground">
              {opensOn
                ? <>Les inscriptions ouvriront le <strong>{opensOn}</strong>. Merci de revenir à cette date.</>
                : "La période d'inscription n'est pas ouverte pour le moment. Merci de revenir plus tard."}
            </p>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/login" className="hover:underline">Espace membres</Link>
          </p>
        </CardContent>
      </Card>
    </ApplicantAuthShell>
  )
}
