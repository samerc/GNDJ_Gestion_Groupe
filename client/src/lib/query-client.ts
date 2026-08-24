import { QueryClient } from '@tanstack/react-query'

// Single shared TanStack Query client. Exported as a module singleton (not created inline in main.tsx) so
// non-React code — notably the auth store — can clear the cache on login/logout. Without that, switching
// accounts in the same tab (SPA, no full reload) would leave the PREVIOUS user's cached data visible to the
// next user (a cross-user data leak), because staleTime keeps it "fresh" and refetchOnWindowFocus is off.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      // This is a CRUD admin app, not a live feed — data is refreshed explicitly via mutation
      // invalidation. Refetching everything on every tab refocus (the library default) just adds
      // load with no real freshness benefit.
      refetchOnWindowFocus: false,
    },
  },
})
