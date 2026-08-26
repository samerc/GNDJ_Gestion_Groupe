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
    // The 60s interval already keeps this fresh; a focus refetch just fired a redundant second
    // /public/maintenance right after login/tab-refocus (the "maintenance called twice" the user saw).
    // Match staleTime to the interval so the focus refetch is a cache hit.
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}
