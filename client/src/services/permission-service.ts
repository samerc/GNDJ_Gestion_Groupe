// The permission taxonomy (labels + domain grouping) — the single source of truth shared by the effective-access
// viewer and the permission editors, fetched from the backend catalog so it always covers every grantable
// permission. Static reference data, cached indefinitely.
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

export interface PermCatalogDomain { key: string; label: string }
export interface PermCatalogPerm { key: string; domainKey: string; label: string }
export interface PermCatalog { domains: PermCatalogDomain[]; permissions: PermCatalogPerm[] }

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ['permissions', 'catalog'],
    queryFn: () => apiClient.get<PermCatalog>('/permissions/catalog').then(r => r.data),
    staleTime: Infinity,
  })
}
