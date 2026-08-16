import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useApplicantProfile, useResendMemberActivation } from '@/services/applicant-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { CheckCircle2, XCircle, ArrowLeft, LogIn, Mail, KeyRound, UploadCloud, UserCheck } from 'lucide-react'

// Result page for a demande whose response has been SENT. Replaces the (now-useless) read-only wizard once
// a decision is posted:
//  • Accepted + member not yet logged in → congratulations + the steps to activate the login and upload
//    documents (the same steps are in the acceptance email), the member's username, a "resend activation
//    email" button, and a link to the member login.
//  • Accepted + member already logged in ("entered the member area") → just a link to the login page.
//  • Declined → the decision, with the reason if the CG gave one.
// Not-yet-sent demandes are redirected back to the wizard (they're still editable/consultable there).
export default function DemandeResultPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: profile, isLoading } = useApplicantProfile()
  const resend = useResendMemberActivation()

  const demande = profile?.demandes.find((d) => d.id === id)

  // A demande without a sent response has no result yet — send them back to the wizard (consultation/edit).
  useEffect(() => {
    if (!isLoading && demande && !demande.responseSentAt) navigate(`/inscription/portail/demande/${id}`, { replace: true })
  }, [isLoading, demande, id, navigate])

  if (isLoading) return <LoadingSpinner variant="page" />
  if (!demande) return null
  if (!demande.responseSentAt) return null // redirecting

  const accepted = demande.status === 'Approved'
  const childName = `${demande.firstName} ${demande.lastName}`.trim()

  const handleResend = async () => {
    try { await resend.mutateAsync(demande.id); toast.success("Email d'activation renvoyé. Consultez votre boîte de réception.") }
    catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/inscription/portail')}>
        <ArrowLeft className="mr-1 h-4 w-4" />Retour à mes demandes
      </Button>

      {/* ── DECLINED ────────────────────────────────────────────────────────────── */}
      {!accepted && (
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 shrink-0 text-red-500" />
              <div>
                <h1 className="text-xl font-bold">Demande non retenue</h1>
                <p className="text-sm text-muted-foreground">{childName}</p>
              </div>
            </div>
            <p className="text-sm">
              Nous sommes au regret de ne pas pouvoir donner une suite favorable à la demande d'inscription de{' '}
              <strong>{childName}</strong> cette année.
            </p>
            {demande.decisionNotes && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="mb-1 font-medium text-muted-foreground">Message de la Maîtrise de Groupe</p>
                <p className="whitespace-pre-line">{demande.decisionNotes}</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">Nous vous remercions de votre intérêt et restons à votre disposition.</p>
          </CardContent>
        </Card>
      )}

      {/* ── ACCEPTED — member already active (entered the member area) ────────────── */}
      {accepted && demande.memberHasLoggedIn && (
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <UserCheck className="h-8 w-8 shrink-0 text-green-600" />
              <div>
                <h1 className="text-xl font-bold">Compte membre actif</h1>
                <p className="text-sm text-muted-foreground">{childName}{demande.decidedUnitName ? ` · ${demande.decidedUnitName}` : ''}</p>
              </div>
            </div>
            <p className="text-sm">Le compte de <strong>{childName}</strong> est actif. Connectez-vous à l'espace membre pour gérer le dossier et téléverser les documents.</p>
            <Button onClick={() => navigate('/login')}><LogIn className="mr-2 h-4 w-4" />Aller à l'espace membre</Button>
          </CardContent>
        </Card>
      )}

      {/* ── ACCEPTED — onboarding steps (member not yet activated) ────────────────── */}
      {accepted && !demande.memberHasLoggedIn && (
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-green-600" />
              <div>
                <h1 className="text-xl font-bold">Demande acceptée 🎉</h1>
                <p className="text-sm text-muted-foreground">
                  {childName} a été accepté(e){demande.decidedUnitName ? <> dans <strong className="text-foreground">{demande.decidedUnitName}</strong></> : ''}.
                </p>
              </div>
            </div>

            <p className="text-sm">Un compte a été créé pour le nouveau membre. Voici les étapes pour accéder à l'espace membre et téléverser les documents. Ces mêmes informations vous ont été envoyées par email.</p>

            {/* Username the parent will use to log in. */}
            {demande.memberUsername && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identifiant de connexion</p>
                <p className="mt-0.5 font-mono text-sm font-semibold">{demande.memberUsername}</p>
              </div>
            )}

            {/* The onboarding steps — mirrors the acceptance email. */}
            <ol className="space-y-3">
              {[
                { icon: Mail, text: <>Consultez l'<strong>email d'acceptation</strong> : il contient votre identifiant et un lien pour définir votre mot de passe.</> },
                { icon: KeyRound, text: <>Cliquez sur le lien et <strong>choisissez votre mot de passe</strong>.</> },
                { icon: LogIn, text: <>Connectez-vous à l'<strong>espace membre</strong> avec votre identifiant.</> },
                { icon: UploadCloud, text: <>Téléversez les <strong>documents requis</strong> depuis « Mes documents ».</> },
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{i + 1}</span>
                  <div className="flex items-start gap-2 pt-0.5 text-sm">
                    <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{s.text}</span>
                  </div>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={() => navigate('/login')}><LogIn className="mr-2 h-4 w-4" />Aller à l'espace membre</Button>
              <Button variant="outline" disabled={resend.isPending} onClick={handleResend}>
                <Mail className="mr-2 h-4 w-4" />{resend.isPending ? 'Envoi…' : "Renvoyer l'email d'activation"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Vous n'avez pas reçu l'email ? Vérifiez vos courriers indésirables, puis utilisez « Renvoyer l'email d'activation ».</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
