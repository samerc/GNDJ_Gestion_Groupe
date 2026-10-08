import { QueryClient } from '@tanstack/react-query'

// Single shared TanStack Query client. Exported as a module singleton (not created inline in main.tsx) so
// non-React code — notably the auth store — can clear the cache on login/logout. Without that, switching
// accounts in the same tab (SPA, no full reload) would leave the PREVIOUS user's cached data visible to the
// next user (a cross-user data leak), because staleTime keeps it "fresh" and refetchOnWindowFocus is off.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      // Only retry transient server errors (5xx) / network failures. A 4xx (401/403/404/validation)
      // is deterministic — retrying it just doubles the perceived latency before the error shows.
      retry: (count, err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status && status >= 400 && status < 500) return false
        return count < 1
      },
      // This is a CRUD admin app, not a live feed — data is refreshed explicitly via mutation
      // invalidation. Refetching everything on every tab refocus (the library default) just adds
      // load with no real freshness benefit.
      refetchOnWindowFocus: false,
    },
  },
})

// Member photos are cached as blob URLs (components/shared/member-photo.tsx, key ['member-photo', …]). Free the blob
// when its cache entry goes away (unused for a while, or the cache is cleared at login/logout), so photos never
// outlive the session that was allowed to see them and memory doesn't grow.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'removed' && event.query.queryKey[0] === 'member-photo') {
    const url = event.query.state.data
    if (typeof url === 'string') URL.revokeObjectURL(url)
  }
})
