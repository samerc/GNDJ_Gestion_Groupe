// "Inscrire un frère ou une sœur" on Ma fiche — shown only while inscriptions are open. One click opens the family's
// enrollment-portal account (created/prefilled by the server from this member's file: parents, address, siblings)
// and lands the parent straight in a new demande — no separate portal registration or email code.
// Who sees it: setting demande.sibling_enroll_audience — off | youth (default: not chefs / super-admins) | all.
// Hidden once submissions are closed (deadline passed or closed by the CG): a demande could not be sent anyway.
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { parseApiError } from '@/lib/error-utils'
import { usePublicSiteConfig } from '@/services/public-service'
import { useApplicantStore, type ApplicantAuthResponse } from '@/stores/applicant-store'
import { Button } from '@/components/ui/button'
import { useIsRegularMember } from '@/lib/use-is-manager'
import { useAuthStore } from '@/stores/auth-store'
import { useSettingValue } from '@/services/settings-service'
import { useApplicantConfig } from '@/services/applicant-service'

export function SiblingEnrollCta() {
  const { data: config } = usePublicSiteConfig()
  const { data: applicantConfig } = useApplicantConfig()
  const adoptSession = useApplicantStore((s) => s.adoptSession)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const isRegular = useIsRegularMember()
  const isMaitrise = useAuthStore((s) => !!s.user?.isMaitrise)
  const audience = useSettingValue('demande.sibling_enroll_audience') ?? 'youth'

  const allowed = audience === 'all' || (audience !== 'off' && isRegular && !isMaitrise)
  if (!config?.inscriptionsOpen || !applicantConfig?.submissionsOpen || !allowed) return null

  const start = async () => {
    setBusy(true)
    try {
      const { data } = await apiClient.post<ApplicantAuthResponse>('/my-profile/start-sibling-demande')
      adoptSession(data)
      navigate('/inscription/portail/demande/new')
    } catch (err) {
      toast.error(parseApiError(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">Inscrire un frère ou une sœur</p>
        <p className="text-sm text-muted-foreground">
          Les parents, l'adresse et la fratrie sont déjà remplis à partir de cette fiche.
        </p>
      </div>
      <Button onClick={start} disabled={busy} className="shrink-0">
        <UserPlus className="mr-1.5 h-4 w-4" />{busy ? 'Ouverture…' : 'Commencer la demande'}
      </Button>
    </div>
  )
}
