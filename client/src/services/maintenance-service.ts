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
    // Polled every 2 minutes in each open tab (maintenance is switched on rarely, and any API call made meanwhile
    // already gets a 503 « maintenance »). No focus refetch: it fired a redundant second call right after login.
    staleTime: 120_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}
