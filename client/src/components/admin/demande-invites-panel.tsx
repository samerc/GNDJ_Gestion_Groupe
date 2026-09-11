import { useState } from 'react'
import { useDemandeInvites, useCreateDemandeInvite, useRevokeDemandeInvite, type DemandeInvite } from '@/services/demande-admin-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import { Ticket, Copy, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { parseApiError } from '@/lib/error-utils'
import { formatDateLong } from '@/lib/utils'

// Builds the public invite link from a token (the family opens this to register/claim).
const inviteLink = (token: string) => `${window.location.origin}/inscription/invitation/${token}`

const STATUS: Record<string, { label: string; className: string }> = {
  active: { label: 'Actif', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  claimed: { label: 'Utilisé', className: 'border-blue-300 bg-blue-50 text-blue-700' },
  expired: { label: 'Expiré', className: 'border-slate-300 bg-slate-50 text-slate-600' },
  revoked: { label: 'Annulé', className: 'border-red-300 bg-red-50 text-red-700' },
}

// CG panel to generate + manage "late-access" invite links — one link lets ONE family enroll after the deadline
// without reopening the portal for everyone. Sits at the top of the Comptes d'inscription page.
export function DemandeInvitesPanel() {
  const [open, setOpen] = useState(false) // collapsed by default (used only around/after the deadline)
  const [createOpen, setCreateOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [email, setEmail] = useState('')
  const [validDays, setValidDays] = useState('14')
  const [revokeTarget, setRevokeTarget] = useState<DemandeInvite | null>(null)

  const { data: invites, isLoading } = useDemandeInvites()
  const create = useCreateDemandeInvite()
  const revoke = useRevokeDemandeInvite()

  const copy = async (token: string) => {
    try { await navigator.clipboard.writeText(inviteLink(token)); toast.success('Lien copié') }
    catch { toast.error('Impossible de copier le lien') }
  }

  const handleCreate = async () => {
    try {
      const days = parseInt(validDays, 10)
      const inv = await create.mutateAsync({
        label: label.trim() || undefined,
        email: email.trim() || undefined,
        validDays: Number.isFinite(days) ? days : undefined,
      })
      await copy(inv.token) // put the fresh link on the clipboard immediately
      setCreateOpen(false); setLabel(''); setEmail(''); setValidDays('14')
      toast.success('Invitation créée — le lien est copié dans le presse-papiers')
    } catch (err) { toast.error(parseApiError(err)) }
  }

  const activeCount = invites?.filter((i) => i.status === 'active').length ?? 0

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <CardTitle className="flex items-center gap-2 text-base">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Ticket className="h-4 w-4 text-primary" />
          Invitations de dernière minute
          {activeCount > 0 && <Badge variant="outline" className="ml-1 border-emerald-300 bg-emerald-50 text-emerald-700">{activeCount} actif{activeCount > 1 ? 's' : ''}</Badge>}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Générez un lien pour autoriser <span className="font-medium">une famille</span> à présenter une demande
            <span className="font-medium"> après la date limite</span>, sans rouvrir les inscriptions pour tout le monde.
            Envoyez le lien à la famille : elle crée un compte (ou se connecte au sien) et peut alors soumettre sa demande.
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Générer un lien</Button>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !invites || invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune invitation générée.</p>
          ) : (
            <div className="space-y-2">
              {invites.map((inv) => {
                const st = STATUS[inv.status] ?? { label: inv.status, className: '' }
                return (
                  <div key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 text-sm">
                    <Badge variant="outline" className={`shrink-0 ${st.className}`}>{st.label}</Badge>
                    <span className="font-medium">{inv.label || <span className="text-muted-foreground">Sans étiquette</span>}</span>
                    {inv.email && <span className="text-muted-foreground">· {inv.email}</span>}
                    <span className="text-xs text-muted-foreground">· expire le {formatDateLong(inv.expiresAt)}</span>
                    {inv.claimedEmail && <span className="text-xs text-blue-700">· utilisé par {inv.claimedEmail}</span>}
                    <div className="ml-auto flex items-center gap-1">
                      {inv.status === 'active' && (
                        <>
                          <Tip content="Copier le lien"><Button variant="outline" size="sm" onClick={() => copy(inv.token)}><Copy className="mr-1 h-3.5 w-3.5" />Copier le lien</Button></Tip>
                          <Tip content="Annuler l'invitation"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setRevokeTarget(inv)}><Trash2 className="h-4 w-4" /></Button></Tip>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      )}

      {/* Generate dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Générer une invitation</DialogTitle>
            <DialogDescription>Un lien à usage unique pour permettre à une famille de s'inscrire après la date limite.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inv-label">Étiquette (pour vous en souvenir)</Label>
              <Input id="inv-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Famille Haddad" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-email">Email de la famille (facultatif)</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="parent@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-days">Validité (jours)</Label>
              <Input id="inv-days" type="number" min={1} max={90} value={validDays} onChange={(e) => setValidDays(e.target.value)} className="w-28" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={create.isPending}>{create.isPending ? 'Création…' : 'Générer le lien'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Annuler cette invitation ?"
        description={`Le lien ${revokeTarget?.label ? `« ${revokeTarget.label} » ` : ''}ne fonctionnera plus.`}
        confirmLabel="Annuler l'invitation"
        variant="destructive"
        loading={revoke.isPending}
        onConfirm={() => {
          if (!revokeTarget) return
          revoke.mutate(revokeTarget.id, {
            onSuccess: () => { toast.success('Invitation annulée'); setRevokeTarget(null) },
            onError: (e) => toast.error(parseApiError(e)),
          })
        }}
      />
    </Card>
  )
}
