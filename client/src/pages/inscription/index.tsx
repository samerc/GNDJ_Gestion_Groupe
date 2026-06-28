import { Link, Navigate } from 'react-router'
import { useApplicantStore } from '@/stores/applicant-store'
import { useApplicantConfig } from '@/services/applicant-service'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { CalendarClock } from 'lucide-react'

// Public entry screen for the applicant (parent/future member) portal at /inscription.
// Anonymous: shows the intro + Créer un compte / Se connecter, or a "fermées" notice when
// inscriptions are closed. Already-logged-in applicants are bounced straight to the portail.
export default function InscriptionLandingPage() {
  const isAuthenticated = useApplicantStore((s) => s.isAuthenticated)
  const { data: config, isLoading } = useApplicantConfig()

  // Skip the landing for a returning applicant who still has a valid session.
  if (isAuthenticated) return <Navigate to="/inscription/portail" replace />

  return (
    <ApplicantAuthShell>
      <Card className="shadow-elevated">
        <CardContent className="space-y-5 pt-6">
          {isLoading ? (
            <LoadingSpinner />
          ) : !config?.isOpen ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CalendarClock className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-lg font-medium">Les inscriptions sont fermées</p>
              <p className="text-sm text-muted-foreground">
                La période d'inscription n'est pas ouverte pour le moment. Merci de revenir plus tard.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2 text-sm text-muted-foreground whitespace-pre-line">
                {config.introText || "Bienvenue ! Créez un compte pour présenter une demande d'inscription au mouvement scout. Vous pourrez inscrire un ou plusieurs enfants."}
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                Année scoute : <strong>{config.scoutYear}</strong>
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full"><Link to="/inscription/register">Créer un compte</Link></Button>
                <Button asChild variant="outline" className="w-full"><Link to="/inscription/login">Se connecter</Link></Button>
              </div>
            </>
          )}
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/login" className="hover:underline">Espace membres</Link>
          </p>
        </CardContent>
      </Card>
    </ApplicantAuthShell>
  )
}
