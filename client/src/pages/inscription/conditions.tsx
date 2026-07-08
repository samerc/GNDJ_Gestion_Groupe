import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useApplicantConfig, useApplicantProfile, useAcceptTerms } from '@/services/applicant-service'
import { useApplicantStore } from '@/stores/applicant-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

// Separate post-login T&C screen: the applicant creates an account, then reads and accepts the terms here
// before reaching the portal. Reached via the terms gate (which redirects here when not yet accepted).
export default function ApplicantConditionsPage() {
  const navigate = useNavigate()
  const logout = useApplicantStore((s) => s.logout)
  const { data: config, isLoading: loadingConfig } = useApplicantConfig()
  const { data: profile, isLoading: loadingProfile } = useApplicantProfile()
  const accept = useAcceptTerms()
  const [checked, setChecked] = useState(false)

  if (loadingConfig || loadingProfile) return <div className="py-10"><LoadingSpinner /></div>

  const terms = config?.terms?.trim() ?? ''
  // Nothing to accept (no terms configured) or already accepted → straight to the portal.
  if (!terms || profile?.termsAccepted) return <Navigate to="/inscription/portail" replace />

  const handleAccept = async () => {
    try {
      await accept.mutateAsync()
      navigate('/inscription/portail', { replace: true })
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  // Refusing is allowed: it just signs the applicant out and returns to the landing. Nothing is deleted —
  // they can log back in and accept later. Without acceptance no demande can be presented.
  const handleRefuse = () => {
    logout()
    navigate('/inscription', { replace: true })
    toast.info("Vous devez accepter les conditions pour présenter une demande d'inscription.")
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-2xl">Conditions d'inscription</CardTitle>
          <CardDescription>Merci de lire et d'accepter les conditions ci-dessous avant de présenter une demande.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm leading-relaxed text-foreground/90">
            {terms}
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 shrink-0" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>J'ai lu et j'accepte les conditions d'inscription.</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="w-full sm:flex-1" disabled={!checked || accept.isPending} onClick={handleAccept}>
              {accept.isPending ? 'Enregistrement...' : 'Accepter et continuer'}
            </Button>
            <Button variant="outline" className="w-full sm:flex-1" disabled={accept.isPending} onClick={handleRefuse}>
              Refuser
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            L'acceptation des conditions est nécessaire pour présenter une demande. Vous pourrez vous reconnecter et accepter plus tard.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
