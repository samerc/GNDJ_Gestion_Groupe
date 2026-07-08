import { Navigate, Outlet } from 'react-router'
import { useApplicantConfig, useApplicantProfile } from '@/services/applicant-service'
import { LoadingSpinner } from '@/components/shared/loading-spinner'

// Gate for the signed-in portal routes: when the CG has configured T&C and the applicant hasn't accepted
// them yet, redirect to the separate /inscription/conditions screen. Sits INSIDE ApplicantProtectedRoute
// (auth already guaranteed) but OUTSIDE the conditions route itself (so there's no redirect loop).
export function ApplicantTermsGate() {
  const { data: config, isLoading: loadingConfig } = useApplicantConfig()
  const { data: profile, isLoading: loadingProfile } = useApplicantProfile()

  if (loadingConfig || loadingProfile) return <div className="py-10"><LoadingSpinner /></div>

  const termsRequired = (config?.terms?.trim() ?? '').length > 0
  if (termsRequired && profile && !profile.termsAccepted)
    return <Navigate to="/inscription/conditions" replace />

  return <Outlet />
}
