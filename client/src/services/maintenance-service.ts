// Maintenance/kill-switch status for the three frontends. Fetched via the PUBLIC (unauthenticated) client
// so the "Sous maintenance" page can render even before login and even while a module's API is 503'd (the
// /public/maintenance endpoint is always exempt from the gate). Polled so a toggle reflects within ~1 min.
import { useQuery } from '@tanstack/react-query'
import publicApi from '@/lib/public-api-client'

export interface MaintenanceStatus {
  site: boolean
  publicSite: boolean
  demande: boolean
  membres: boolean
  message: string
}

export function useMaintenance() {
  return useQuery({
    queryKey: ['maintenance'],
    queryFn: () => publicApi.get<MaintenanceStatus>('/public/maintenance').then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true, // pick up a toggle promptly when the user comes back to the tab
    retry: false,
  })
}
