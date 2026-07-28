import { Outlet } from 'react-router'
import { useMaintenance } from '@/services/maintenance-service'
import { MaintenancePage } from '@/components/shared/maintenance-page'

// Wraps every /inscription (applicant portal) route: shows the maintenance page when the whole site or the
// "demande" module is turned off from settings, otherwise renders the applicant routes.
export function ApplicantMaintenanceGate() {
  const { data: maint } = useMaintenance()
  if (maint && (maint.site || maint.demande)) return <MaintenancePage message={maint.message} />
  return <Outlet />
}
