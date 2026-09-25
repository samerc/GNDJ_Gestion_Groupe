// One-time, SKIPPABLE contact-review popup ("Vérifiez vos coordonnées") — the GATE. It decides whether the popup
// shows at all and only then loads the dialog (contact-review-dialog.tsx) on demand: the dialog pulls in the
// phone-number formatting library (~300 KB), which must not be part of the first load of every page.
import { lazy, Suspense } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useContactReviewStore } from '@/stores/contact-review-store'

const ContactReviewDialog = lazy(() => import('./contact-review-dialog'))

export function ContactReviewPopup() {
  const user = useAuthStore((s) => s.user)
  // Shared skip flag (see contact-review-store) so the welcome tour can react when the member defers this popup.
  const skipped = useContactReviewStore((s) => s.skipped)
  const skip = useContactReviewStore((s) => s.skip)
  const shouldShow = !!user?.needsContactReview && !!user?.memberId && !skipped
  if (!shouldShow) return null
  return (
    <Suspense fallback={null}>
      <ContactReviewDialog memberId={user!.memberId} onSkip={skip} />
    </Suspense>
  )
}
