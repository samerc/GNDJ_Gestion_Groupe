import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App'
import { ErrorBoundary } from '@/components/shared/error-boundary'
import { reportClientError, isBenignError } from '@/lib/error-report'

const queryClient = new QueryClient({
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

// Safety net for errors OUTSIDE React's render tree (async callbacks, event handlers, unhandled promise
// rejections) — the ErrorBoundary only catches render crashes. Benign/handled cases are filtered out so the
// admin isn't alerted for ordinary API errors or browser layout warnings.
window.addEventListener('error', (e) => {
  if (isBenignError(e.error)) return // no error object (e.g. cross-origin script) or an already-handled one
  reportClientError({ message: e.message || 'window.error', detail: (e.error as Error)?.stack, url: location.href })
})
window.addEventListener('unhandledrejection', (e) => {
  if (isBenignError(e.reason)) return
  const r = e.reason as Error
  reportClientError({ message: r?.message || String(e.reason) || 'unhandledrejection', detail: r?.stack, url: location.href })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
