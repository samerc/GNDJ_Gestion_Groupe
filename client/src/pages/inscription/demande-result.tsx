import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useApplicantProfile, useApplicantConfig, useResendMemberActivation } from '@/services/applicant-service'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { CheckCircle2, XCircle, LogIn, Mail, KeyRound, UploadCloud, UserCheck } from 'lucide-react'
import { BackLink } from '@/components/shared/back-link'
import { PageHeader } from '@/components/shared/page-header'

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
  const { data: config } = useApplicantConfig()
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
  // The child was already an active member: nothing to accept or refuse, the existing fiche was updated.
  const alreadyMember = demande.status === 'AlreadyMember'
  const childName = `${demande.firstName} ${demande.lastName}`.trim()

  const handleResend = async () => {
    try { await resend.mutateAsync(demande.id); toast.success("Email d'activation renvoyé. Consultez votre boîte de réception.") }
    catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink to="/inscription/portail" label="Mes demandes" />

      {/* One header for the three outcomes (declined / member already active / accepted). */}
      <PageHeader
        icon={alreadyMember ? UserCheck : !accepted ? XCircle : demande.memberHasLoggedIn ? UserCheck : CheckCircle2}
        title={alreadyMember ? 'Déjà membre du groupe' : !accepted ? 'Demande non retenue' : demande.memberHasLoggedIn ? 'Compte membre actif' : 'Demande acceptée'}
        description={
          <>
            {childName}
            {accepted && demande.decidedUnitName ? ` · ${demande.decidedUnitName}` : ''}
            {demande.serialNumber && <> · Demande N° <span className="font-mono font-semibold text-foreground">{demande.serialNumber}</span></>}
          </>
        }
      />

      {/* ── DECLINED ────────────────────────────────────────────────────────────── */}
      {/* ── ALREADY AN ACTIVE MEMBER ─────────────────────────────────────────────── */}
      {alreadyMember && (
        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="space-y-4 p-6">
            <p className="text-sm">
              {childName} est déjà membre du groupe : aucune nouvelle inscription n'est nécessaire. Les informations de
              cette demande ont été ajoutées à sa fiche. Il ou elle continue avec son identifiant habituel.
            </p>
            <Button onClick={() => navigate('/login')}><LogIn className="mr-2 h-4 w-4" />Aller à l'espace membres</Button>
          </CardContent>
        </Card>
      )}

      {!accepted && !alreadyMember && (
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="space-y-4 p-6">
            <p className="whitespace-pre-line text-sm">
              {config?.resultTextDeclined ||
                "Nous sommes au regret de ne pas pouvoir donner une suite favorable à votre demande d'inscription cette année. Nous vous remercions de votre intérêt et restons à votre disposition."}
            </p>
            {demande.decisionNotes && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="mb-1 font-medium text-muted-foreground">Message de la Maîtrise de Groupe</p>
                <p className="whitespace-pre-line">{demande.decisionNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── ACCEPTED — member already active (entered the member area) ────────────── */}
      {accepted && demande.memberHasLoggedIn && (
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="space-y-4 p-6">
            <p className="text-sm">Le compte de <strong>{childName}</strong> est actif. Connectez-vous à l'espace membres pour gérer le dossier et téléverser les documents.</p>
            <Button onClick={() => navigate('/login')}><LogIn className="mr-2 h-4 w-4" />Aller à l'espace membres</Button>
          </CardContent>
        </Card>
      )}

      {/* ── ACCEPTED — onboarding steps (member not yet activated) ────────────────── */}
      {accepted && !demande.memberHasLoggedIn && (
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="space-y-5 p-6">
            <p className="text-sm">
              {childName} a été accepté(e){demande.decidedUnitName ? <> dans <strong>{demande.decidedUnitName}</strong></> : ''}.
            </p>
            <p className="whitespace-pre-line text-sm">{config?.resultTextAccepted || "Un compte a été créé pour le nouveau membre. Voici les étapes pour accéder à l'espace membres et téléverser les documents. Ces mêmes informations vous ont été envoyées par email."}</p>

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
                { icon: LogIn, text: <>Connectez-vous à l'<strong>espace membres</strong> avec votre identifiant.</> },
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
              <Button onClick={() => navigate('/login')}><LogIn className="mr-2 h-4 w-4" />Aller à l'espace membres</Button>
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
