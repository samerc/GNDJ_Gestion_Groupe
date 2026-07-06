import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useVerifyEmail } from '@/services/applicant-service'
import { useApplicantStore } from '@/stores/applicant-store'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle } from 'lucide-react'

// Landing target of the email-verification link (/inscription/verify?token=…). Auto-fires the
// verify mutation once on mount and shows ok / error; on success flips the store's emailVerified
// flag so the portail drops its "vérifiez votre email" banner.
export default function ApplicantVerifyPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const verify = useVerifyEmail()
  const setEmailVerified = useApplicantStore((s) => s.setEmailVerified)
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending')
  const ran = useRef(false) // guard: ensures we POST the token exactly once (StrictMode double-mount / re-renders)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    // Genuine one-shot side-effect: POST the verification token exactly once and reflect the outcome.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!token) { setState('error'); return }
    verify.mutateAsync(token).then(() => { setEmailVerified(true); setState('ok') }).catch(() => setState('error'))
  }, [token, verify, setEmailVerified])

  return (
    <ApplicantAuthShell subtitle="Vérification de l'email">
      <Card className="shadow-elevated">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          {state === 'pending' && <p className="text-muted-foreground">Vérification en cours...</p>}
          {state === 'ok' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <p className="text-lg font-medium">Email vérifié</p>
              <Button asChild><Link to="/inscription/portail">Accéder à mon espace</Link></Button>
            </>
          )}
          {state === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-lg font-medium">Lien invalide ou expiré</p>
              <Button asChild variant="outline"><Link to="/inscription/portail">Retour à mon espace</Link></Button>
            </>
          )}
        </CardContent>
      </Card>
    </ApplicantAuthShell>
  )
}
