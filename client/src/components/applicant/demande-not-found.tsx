import { Link } from 'react-router'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Shown when a portal link points to a demande that isn't on this account anymore (merged by the CG, deleted, or an
// old link from another account) — instead of an empty page.
export function DemandeNotFound() {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium">Demande introuvable</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Cette demande n'existe plus sur votre compte (elle a peut-être été regroupée avec une autre ou supprimée).
      </p>
      <Button asChild className="mt-4"><Link to="/inscription/portail">Mes demandes</Link></Button>
    </div>
  )
}
