import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useVerifyEmail, useResendVerification } from '@/services/applicant-service'
import { useApplicantStore } from '@/stores/applicant-store'
import { ApplicantAuthShell } from '@/components/applicant/applicant-auth-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { parseApiError } from '@/lib/error-utils'
import { CheckCircle2, XCircle, MailCheck } from 'lucide-react'

// Two roles:
//  • WITH ?token=… → the landing target of the email-verification LINK: auto-fires the verify mutation once and
//    shows ok / error; on success flips the store's emailVerified flag.
//  • WITHOUT a token → the "awaiting verification" screen the verify GATE sends an unverified applicant to
//    (when email verification is required): tells them to click the link in their inbox + lets them resend it.
export default function ApplicantVerifyPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const verify = useVerifyEmail()
  const resend = useResendVerification()
  const email = useApplicantStore((s) => s.email)
  const setEmailVerified = useApplicantStore((s) => s.setEmailVerified)
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending')
  const ran = useRef(false) // guard: POST the token exactly once (StrictMode double-mount / re-renders)

  useEffect(() => {
    if (ran.current || !token) return
    ran.current = true
    // Genuine one-shot side-effect: POST the verification token exactly once and reflect the outcome
    // (state is set asynchronously in .then/.catch, not synchronously in the effect body).
    verify.mutateAsync(token).then(() => { setEmailVerified(true); setState('ok') }).catch(() => setState('error'))
  }, [token, verify, setEmailVerified])

  // Awaiting-verification screen (no token in the URL).
  if (!token) {
    return (
      <ApplicantAuthShell subtitle="Vérifiez votre email">
        <Card className="shadow-elevated">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <MailCheck className="h-12 w-12 text-primary" />
            <p className="text-lg font-medium">Vérifiez votre adresse email</p>
            <p className="text-sm text-muted-foreground">
              Nous avons envoyé un lien de vérification{email ? <> à <strong>{email}</strong></> : ''}. Cliquez sur
              ce lien pour activer votre compte, puis revenez ici. Pensez à vérifier vos courriers indésirables.
            </p>
            <Button
              variant="outline"
              disabled={resend.isPending}
              onClick={() => resend.mutateAsync()
                .then(() => toast.success('Email de vérification renvoyé.'))
                .catch((e) => toast.error(parseApiError(e)))}
            >
              Renvoyer l'email de vérification
            </Button>
          </CardContent>
        </Card>
      </ApplicantAuthShell>
    )
  }

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
