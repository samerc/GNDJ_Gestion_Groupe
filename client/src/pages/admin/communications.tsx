// CG "Envoyer un message aux chefs" page ("/admin/communications", perm maitrise.manage). Pick an email
// template, choose a segment of leaders (all / never-logged-in "nouveaux chefs" / one unit), review + adjust
// the recipient list, and send. Reusable for the yearly rentrée onboarding (2 CU templates) and any mid-year
// announcement to the maîtrise. Sends are queued via the durable outbox. Leaders-only by design.
import { useState } from 'react'
import { useLeaderRecipients, useSendLeaderMessage } from '@/services/communications-service'
import { useEmailTemplates } from '@/services/email-service'
import { useUnits } from '@/services/unit-service'
import { parseApiError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Send, Users, MailWarning } from 'lucide-react'
import { toast } from 'sonner'

export default function CommunicationsPage() {
  const [templateCode, setTemplateCode] = useState('')
  const [unitId, setUnitId] = useState<string>('') // '' = all units
  const [neverLoggedInOnly, setNeverLoggedInOnly] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: templates } = useEmailTemplates()
  const { data: unitsPage } = useUnits({ isActive: true, pageSize: 100 })
  const { data: recipients, isLoading } = useLeaderRecipients(unitId || undefined, neverLoggedInOnly)
  const send = useSendLeaderMessage()

  const activeTemplates = (templates ?? []).filter((t) => t.isActive)
  const units = unitsPage?.items ?? []

  // Selection: default-select every recipient that has a contact email. Reset in render (not an effect) whenever
  // the recipient list changes — the codebase's derived-state-reset pattern (avoids set-state-in-effect).
  const recipientsKey = (recipients ?? []).map((r) => r.memberId).join(',')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [syncKey, setSyncKey] = useState('__init__')
  if (recipients && recipientsKey !== syncKey) {
    setSyncKey(recipientsKey)
    setSelected(new Set(recipients.filter((r) => r.contactEmail).map((r) => r.memberId)))
  }

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allSelected = !!recipients && recipients.length > 0 && recipients.every((r) => selected.has(r.memberId))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set((recipients ?? []).map((r) => r.memberId)))

  const selectedCount = selected.size
  const selectedNoEmail = (recipients ?? []).filter((r) => selected.has(r.memberId) && !r.contactEmail).length
  const canSend = !!templateCode && selectedCount > 0

  const doSend = async () => {
    try {
      const res = await send.mutateAsync({ templateCode, memberIds: [...selected] })
      setConfirmOpen(false)
      if (res.sent > 0) toast.success(`${res.sent} message(s) envoyé(s).${res.noEmail > 0 ? ` ${res.noEmail} sans email.` : ''}`)
      else toast.warning('Aucun message envoyé (aucun destinataire avec email).')
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const templateName = activeTemplates.find((t) => t.code === templateCode)?.name ?? ''

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Envoyer un message aux chefs</h1>
        <p className="text-sm text-muted-foreground">
          Envoyez un modèle d'email aux chefs (maîtrise) — par exemple l'email d'accueil de rentrée, aux nouveaux
          chefs ou à tous.
        </p>
      </div>

      {/* Template + segment controls */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Modèle d'email</Label>
          <Select value={templateCode} onValueChange={setTemplateCode}>
            <SelectTrigger><SelectValue placeholder="Choisir un modèle…" /></SelectTrigger>
            <SelectContent>
              {activeTemplates.map((t) => <SelectItem key={t.id} value={t.code}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Unité</Label>
          <Select value={unitId || 'all'} onValueChange={(v) => setUnitId(v === 'all' ? '' : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les unités</SelectItem>
              {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant={neverLoggedInOnly ? 'default' : 'outline'}
            onClick={() => setNeverLoggedInOnly((v) => !v)}
            className="w-full sm:w-auto"
          >
            Nouveaux chefs uniquement
          </Button>
        </div>
      </div>

      {/* Recipients */}
      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !recipients || recipients.length === 0 ? (
        <EmptyState icon={Users} title="Aucun chef" description="Aucun chef ne correspond à ce filtre." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Tout sélectionner" />
                </TableHead>
                <TableHead>Chef</TableHead>
                <TableHead>Unité(s)</TableHead>
                <TableHead>Email de contact</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((r) => (
                <TableRow key={r.memberId} className={selected.has(r.memberId) ? 'bg-primary/5' : undefined}>
                  <TableCell>
                    <input type="checkbox" checked={selected.has(r.memberId)} onChange={() => toggle(r.memberId)}
                      aria-label={`Sélectionner ${r.fullName}`} />
                  </TableCell>
                  <TableCell className="font-medium">{r.fullName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.units}</TableCell>
                  <TableCell className="text-sm">
                    {r.contactEmail
                      ? <span className="break-all">{r.contactEmail}</span>
                      : <span className="inline-flex items-center gap-1 text-amber-600"><MailWarning className="h-3.5 w-3.5" /> Aucun email</span>}
                  </TableCell>
                  <TableCell>
                    {!r.hasLoggedIn && (
                      <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">Jamais connecté</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Send bar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {selectedCount} sélectionné(s){selectedNoEmail > 0 ? ` · ${selectedNoEmail} sans email (ignoré(s))` : ''}
        </span>
        <Button onClick={() => setConfirmOpen(true)} disabled={!canSend || send.isPending}>
          <Send className="mr-2 h-4 w-4" /> Envoyer
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Envoyer le message ?"
        description={`Envoyer « ${templateName} » à ${selectedCount - selectedNoEmail} chef(s) avec un email de contact${selectedNoEmail > 0 ? ` (${selectedNoEmail} sans email seront ignorés)` : ''}.`}
        confirmLabel="Envoyer"
        loading={send.isPending}
        onConfirm={doSend}
      />
    </div>
  )
}
