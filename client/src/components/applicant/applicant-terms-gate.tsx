import { Navigate, Outlet } from 'react-router'
import { useApplicantConfig, useApplicantProfile } from '@/services/applicant-service'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { GateLoadError } from './gate-load-error'

// Gate for the signed-in portal routes: when the CG has configured T&C and the applicant hasn't accepted
// them yet, redirect to the separate /inscription/conditions screen. Sits INSIDE ApplicantProtectedRoute
// (auth already guaranteed) but OUTSIDE the conditions route itself (so there's no redirect loop).
export function ApplicantTermsGate() {
  const cfg = useApplicantConfig()
  const prof = useApplicantProfile()
  const { data: config, isLoading: loadingConfig } = cfg
  const { data: profile, isLoading: loadingProfile } = prof

  if (loadingConfig || loadingProfile) return <div className="py-10"><LoadingSpinner /></div>
  // Couldn't load config/profile → don't let the parent through unchecked; offer a retry instead.
  if (!config || !profile)
    return <GateLoadError retrying={cfg.isFetching || prof.isFetching} onRetry={() => { cfg.refetch(); prof.refetch() }} />

  const termsRequired = (config?.terms?.trim() ?? '').length > 0
  if (termsRequired && profile && !profile.termsAccepted)
    return <Navigate to="/inscription/conditions" replace />

  return <Outlet />
}
