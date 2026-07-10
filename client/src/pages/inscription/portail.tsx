import { useNavigate } from 'react-router'
import { useApplicantConfig, useApplicantProfile, useDeleteDemande, useResendVerification, type Demande } from '@/services/applicant-service'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { UserPlus, Pencil, Trash2, Users, MailWarning, CheckCircle2, XCircle, Clock, FileEdit } from 'lucide-react'

// Maps a demande to its status: a coloured row bar (green accepted / amber pending / red refused /
// grey draft) + a matching badge. The CG's decision is only revealed once the response batch has
// been sent (Brouillon → Soumise → Acceptée/Refusée).
function statusMeta(d: Demande): { border: string; badge: React.ReactNode } {
  if (d.responseSentAt && d.status === 'Approved')
    return { border: 'border-l-green-500', badge: <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Acceptée</Badge> }
  if (d.responseSentAt && d.status === 'Declined')
    return { border: 'border-l-red-500', badge: <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Refusée</Badge> }
  if (d.status === 'Draft')
    return { border: 'border-l-slate-300', badge: <Badge variant="secondary"><FileEdit className="mr-1 h-3 w-3" />Brouillon</Badge> }
  return { border: 'border-l-amber-500', badge: <Badge className="bg-amber-500"><Clock className="mr-1 h-3 w-3" />Soumise</Badge> }
}

// Applicant home after login: lists the account's demandes (one per child) as cards, with the
// add/edit/delete entry points into the wizard and the verify-email / closed / quota banners.
export default function ApplicantPortalPage() {
  const navigate = useNavigate()
  const { data: config } = useApplicantConfig()
  const { data: profile, isLoading } = useApplicantProfile()
  const deleteMutation = useDeleteDemande()
  const resendMutation = useResendVerification()

  if (isLoading) return <LoadingSpinner variant="page" />
  if (!profile) return null

  const demandes = profile.demandes
  const max = config?.maxPerAccount ?? 5 // server-configured cap on children per account
  const open = config?.isOpen ?? false // portal accessible (login + view)
  // Submission window (inside the open period): can create/edit/submit/delete. Once the CG closes it, the
  // portal stays open for viewing but everything becomes read-only (review phase).
  const canSubmit = open && (config?.submissionsOpen ?? false)
  const reviewPhase = open && !(config?.submissionsOpen ?? false)
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
        <Button onClick={() => navigate('/inscription/portail/demande/new')} disabled={!canSubmit || reachedMax}>
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

      {reviewPhase && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm text-blue-800">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">La période de soumission est terminée</p>
            <p>Vos demandes sont en cours d'étude par la Maîtrise de Groupe. Vous pouvez suivre leur statut ici ; les résultats vous seront communiqués prochainement. Aucune modification n'est possible pour le moment.</p>
          </div>
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
        // Table (with a coloured status bar per row) so several children are easy to scan at a glance.
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Enfant</th>
                <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell">Date de naissance</th>
                <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell">Soumise le</th>
                <th className="px-4 py-2.5 text-left font-medium">Statut</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {demandes.map((d) => {
                // locked = no longer deletable (replied-to, or already submitted past Draft);
                // editable = wizard can still be opened to change it (period open + not yet replied to).
                const locked = !!d.responseSentAt || !!d.submittedAt && d.status !== 'Draft'
                const editable = canSubmit && !d.responseSentAt
                const { border, badge } = statusMeta(d)
                return (
                  <tr key={d.id} className="hover:bg-muted/30">
                    {/* Coloured left bar = status at a glance */}
                    <td className={`border-l-4 ${border} px-4 py-3`}>
                      <div className="font-medium">{d.firstName} {d.lastName}</div>
                      {/* On small screens DOB/école are hidden as columns — show DOB inline here */}
                      <div className="text-xs text-muted-foreground sm:hidden">
                        {d.dateOfBirth ? new Date(d.dateOfBirth).toLocaleDateString('fr-FR') : 'Naissance non renseignée'}
                      </div>
                      {d.responseSentAt && d.status === 'Declined' && d.decisionNotes && (
                        <div className="mt-1 max-w-xs text-xs text-muted-foreground">{d.decisionNotes}</div>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground sm:table-cell">
                      {d.dateOfBirth ? new Date(d.dateOfBirth).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">
                      {d.submittedAt ? new Date(d.submittedAt).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-3">{badge}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/inscription/portail/demande/${d.id}`)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />{editable && d.status === 'Draft' ? 'Continuer' : 'Voir'}
                        </Button>
                        {editable && !locked && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(d)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
