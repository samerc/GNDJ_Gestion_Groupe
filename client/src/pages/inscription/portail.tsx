import { useNavigate } from 'react-router'
import { useApplicantConfig, useApplicantProfile, useDeleteDemande, useResendVerification, type Demande } from '@/services/applicant-service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { UserPlus, Pencil, Trash2, Users, MailWarning, CheckCircle2, XCircle, Clock, FileEdit } from 'lucide-react'

function statusBadge(d: Demande) {
  // The CG's decision is only revealed once the response batch has been sent.
  if (d.responseSentAt) {
    if (d.status === 'Approved') return <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Acceptée</Badge>
    if (d.status === 'Declined') return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Refusée</Badge>
  }
  if (d.status === 'Draft') return <Badge variant="secondary"><FileEdit className="mr-1 h-3 w-3" />Brouillon</Badge>
  return <Badge className="bg-blue-600"><Clock className="mr-1 h-3 w-3" />Soumise</Badge>
}

export default function ApplicantPortalPage() {
  const navigate = useNavigate()
  const { data: config } = useApplicantConfig()
  const { data: profile, isLoading } = useApplicantProfile()
  const deleteMutation = useDeleteDemande()
  const resendMutation = useResendVerification()

  if (isLoading) return <LoadingSpinner variant="page" />
  if (!profile) return null

  const demandes = profile.demandes
  const max = config?.maxPerAccount ?? 5
  const open = config?.isOpen ?? false
  const reachedMax = demandes.length >= max
  const needsVerify = config?.requireEmailVerification && !profile.emailVerified

  const handleDelete = async (d: Demande) => {
    if (!confirm(`Supprimer la demande de ${d.firstName} ${d.lastName} ?`)) return
    try { await deleteMutation.mutateAsync(d.id); toast.success('Demande supprimée') }
    catch (err) { toast.error(parseApiError(err)) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mes demandes d'inscription</h1>
          <p className="text-sm text-muted-foreground">{profile.email} · Année {config?.scoutYear}</p>
        </div>
        <Button onClick={() => navigate('/inscription/portail/demande/new')} disabled={!open || reachedMax}>
          <UserPlus className="mr-2 h-4 w-4" />Ajouter un enfant
        </Button>
      </div>

      {needsVerify && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <MailWarning className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-2">
            <p className="font-medium">Vérifiez votre adresse email</p>
            <p>Un email de vérification vous a été envoyé. Vous devez confirmer votre adresse avant de pouvoir soumettre une demande.</p>
            <Button size="sm" variant="outline" disabled={resendMutation.isPending} onClick={async () => {
              try { await resendMutation.mutateAsync(); toast.success('Email de vérification renvoyé') }
              catch (err) { toast.error(parseApiError(err)) }
            }}>{resendMutation.isPending ? 'Envoi…' : "Renvoyer l'email"}</Button>
          </div>
        </div>
      )}

      {!open && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Les inscriptions sont actuellement fermées. Vous pouvez consulter vos demandes mais pas les modifier.
        </div>
      )}

      {reachedMax && open && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Vous avez atteint le maximum de {max} demande(s) pour cette année.
        </div>
      )}

      {demandes.length === 0 ? (
        <EmptyState icon={Users} title="Aucune demande" description="Cliquez sur « Ajouter un enfant » pour présenter une demande d'inscription." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {demandes.map((d) => {
            const locked = !!d.responseSentAt || !!d.submittedAt && d.status !== 'Draft'
            const editable = open && !d.responseSentAt
            return (
              <Card key={d.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-base">{d.firstName} {d.lastName}</CardTitle>
                  {statusBadge(d)}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {d.dateOfBirth ? new Date(d.dateOfBirth).toLocaleDateString('fr-FR') : 'Date de naissance non renseignée'}
                    {d.school ? ` · ${d.school}` : ''}
                  </div>
                  {d.responseSentAt && d.status === 'Declined' && d.decisionNotes && (
                    <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">{d.decisionNotes}</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/inscription/portail/demande/${d.id}`)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />{editable && d.status === 'Draft' ? 'Continuer' : 'Voir'}
                    </Button>
                    {editable && !locked && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(d)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
