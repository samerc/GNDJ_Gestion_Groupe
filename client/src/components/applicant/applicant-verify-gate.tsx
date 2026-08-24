import { Navigate, Outlet } from 'react-router'
import { useApplicantConfig, useApplicantProfile } from '@/services/applicant-service'
import { LoadingSpinner } from '@/components/shared/loading-spinner'

// Gate for the signed-in portal routes: when email verification is REQUIRED (demande.require_email_verification
// is on) and the applicant hasn't verified their address yet, redirect to the /inscription/verify "check your
// email" screen — BEFORE they can reach the portail/wizard. Enforces verification up front (user request)
// instead of only at submit time. Sits inside ApplicantProtectedRoute (auth guaranteed) but must wrap the
// portal routes OUTSIDE the /verify route itself (no redirect loop). Honours the setting: when it's off, this
// gate is a no-op so testing can proceed unverified.
export function ApplicantVerifyGate() {
  const { data: config, isLoading: loadingConfig } = useApplicantConfig()
  const { data: profile, isLoading: loadingProfile } = useApplicantProfile()

  if (loadingConfig || loadingProfile) return <div className="py-10"><LoadingSpinner /></div>

  if (config?.requireEmailVerification && profile && !profile.emailVerified)
    return <Navigate to="/inscription/verify" replace />

  return <Outlet />
}
