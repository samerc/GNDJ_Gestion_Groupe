import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Shown by the portal gates (email verification / T&C) when the applicant's config or profile could NOT be
// loaded (a brief network drop, a server hiccup). The gates used to fall through to the portal in that case —
// letting a parent past a check the server would still enforce at submit. Now they stop here with a retry.
export function GateLoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
        <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
      </div>
      <p className="font-medium">Impossible de charger votre compte.</p>
      <p className="mt-1 text-sm text-muted-foreground">Vérifiez votre connexion internet puis réessayez.</p>
      <Button className="mt-4" onClick={onRetry} disabled={retrying}>
        <RotateCcw className="mr-2 h-4 w-4" />{retrying ? 'Chargement…' : 'Réessayer'}
      </Button>
    </div>
  )
}
