import { create } from 'zustand'

// Session-scoped "the contact-review popup was deferred (Plus tard) this session" flag, shared so the welcome
// tour can react to it: the tour waits while the review is ON SCREEN (needsContactReview && !skipped) and
// appears once it's dismissed — whether the member CONFIRMED it (needsContactReview flips via loadUser) OR
// deferred it here. Backed by sessionStorage so it survives a route change but resets next session (the review
// re-appears next login). Lifting it out of the popup's local state lets the tour subscribe reactively.
const SKIP_KEY = 'contact-review.skip'

interface ContactReviewState {
  skipped: boolean
  skip: () => void
}

export const useContactReviewStore = create<ContactReviewState>((set) => ({
  skipped: (() => { try { return sessionStorage.getItem(SKIP_KEY) === '1' } catch { return false } })(),
  skip: () => {
    try { sessionStorage.setItem(SKIP_KEY, '1') } catch { /* private mode */ }
    set({ skipped: true })
  },
}))
