import { Navigate, Outlet } from 'react-router'
import { useApplicantConfig } from '@/services/applicant-service'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { LoadingSpinner } from '@/components/shared/loading-spinner'

// ROLE: gate for the ANONYMOUS applicant sub-pages (login / register / verify).
// When inscriptions are closed (demande.enabled = false → ApplicantConfig.isOpen),
// these entry points must not be reachable — bounce to the /inscription landing,
// which shows the "Les inscriptions sont fermées" notice. Without this a family
// could deep-link straight to /inscription/login and see the sign-in form.
export function ApplicantOpenRoute() {
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

  return <Outlet />
}
