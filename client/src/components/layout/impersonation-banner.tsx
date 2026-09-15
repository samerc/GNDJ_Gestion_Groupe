import { Eye } from 'lucide-react'
import { useImpersonationStore } from '@/stores/impersonation-store'

// Persistent high-contrast bar shown while "Voir comme" is active. Rendered at the very top of AppLayout —
// ABOVE the first-login/maintenance blocking gates — so "Quitter" is always reachable. Read-only is enforced
// server-side; this makes the mode unmistakable so no one thinks they're editing the member's real data.
export function ImpersonationBanner() {
  const active = useImpersonationStore((s) => s.active)
  const memberName = useImpersonationStore((s) => s.memberName)
  const stop = useImpersonationStore((s) => s.stop)
  if (!active) return null
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-amber-950 dark:bg-amber-600 dark:text-amber-50">
      <span className="flex items-center gap-1.5">
        <Eye className="h-4 w-4 shrink-0" />
        Vous consultez en tant que <strong>{memberName}</strong> — lecture seule
      </span>
      <button
        onClick={() => void stop()}
        className="rounded bg-amber-950/15 px-2 py-0.5 font-semibold hover:bg-amber-950/25 dark:bg-amber-50/20 dark:hover:bg-amber-50/30"
      >
        Quitter
      </button>
    </div>
  )
}
