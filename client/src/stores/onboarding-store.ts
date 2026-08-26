import { create } from 'zustand'

// Bridges the user menu ("Revoir le tutoriel") → the MemberWelcomeTour so a member can replay the first-login
// carousel on demand, independent of the once-per-member server flag (hasSeenOnboarding). The tour watches
// `replay`: while true it shows regardless of the flag; it calls close() when dismissed.
interface OnboardingTourState {
  replay: boolean
  open: () => void
  close: () => void
}

export const useOnboardingTour = create<OnboardingTourState>((set) => ({
  replay: false,
  open: () => set({ replay: true }),
  close: () => set({ replay: false }),
}))
