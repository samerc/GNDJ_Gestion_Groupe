import { Link, Navigate, Outlet } from 'react-router'
import { CalendarX } from 'lucide-react'
import { useApplicantConfig, isSubmissionDeadlinePassed } from '@/services/applicant-service'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { formatDateLong } from '@/lib/utils'

// ROLE: gate for the ANONYMOUS applicant sub-pages (login / register / verify).
// When inscriptions are closed (demande.enabled = false → ApplicantConfig.isOpen),
// these entry points must not be reachable — bounce to the /inscription landing,
// which shows the "Les inscriptions sont fermées" notice. Without this a family
// could deep-link straight to /inscription/login and see the sign-in form.
// `submissionsRequired` (used for REGISTER) also blocks the page during the review phase
// (portal open but submissions closed) — no point creating an account you can't submit with.
// Instead of silently bouncing to login, it shows WHY (deadline passed) with a link for
// families that already have an account.
export function ApplicantOpenRoute({ submissionsRequired = false }: { submissionsRequired?: boolean }) {
  const { data: config, isLoading } = useApplicantConfig()

  // Wait for the config so we don't flash the form before knowing it's closed.
  if (isLoading) {
    return (
      <ApplicantAuthShell>
        <div className="py-10">
          <LoadingSpinner />
        </div>
      </ApplicantAuthShell>
    )
  }

  if (!config?.isOpen) return <Navigate to="/inscription" replace />

  // Register while the submission window is closed → explain (deadline passed vs manual close) instead of
  // redirecting to login, so a parent clicking "Créer un compte" understands they can no longer inscrire.
  if (submissionsRequired && !config?.submissionsOpen) {
    const deadlinePassed = isSubmissionDeadlinePassed(config?.submissionDeadline)
    return (
      <ApplicantAuthShell subtitle="Inscriptions clôturées">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <CalendarX className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              {deadlinePassed ? (
                <>
                  <p className="font-medium">La date limite de soumission est dépassée</p>
                  <p>La date limite était le {formatDateLong(config?.submissionDeadline)}. La création d'un nouveau compte d'inscription n'est plus possible pour cette année scoute.</p>
                </>
              ) : (
                <>
                  <p className="font-medium">Les inscriptions sont clôturées</p>
                  <p>La période de soumission des demandes est terminée. La création d'un nouveau compte d'inscription n'est plus possible pour le moment.</p>
                </>
              )}
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Vous avez déjà un compte ?{' '}
            <Link to="/inscription/login" className="font-medium text-primary hover:underline">Se connecter</Link>
          </p>
        </div>
      </ApplicantAuthShell>
    )
  }

  return <Outlet />
}
