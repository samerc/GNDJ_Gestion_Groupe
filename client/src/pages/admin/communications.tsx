// CG "Envoyer un message aux chefs" page ("/admin/communications", perm maitrise.manage). Pick a template,
// choose the audience (toutes les maîtrises / une unité), optionally narrow to new chefs (never logged in),
// fine-tune the list with checkboxes, PREVIEW the email, and send. Reusable for the yearly rentrée onboarding
// and any mid-year announcement. Sends are queued via the durable outbox. Leaders-only by design.
import { useState } from 'react'
import { Link } from 'react-router'
import { useLeaderRecipients, useSendLeaderMessage, useLeaderMessageTemplates } from '@/services/communications-service'
import { useUnits } from '@/services/unit-service'
import { useCurrentScoutYear } from '@/hooks/use-scout-year'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'
import { parseApiError } from '@/lib/error-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/shared/rich-text-editor'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Page } from '@/components/shared/page'
import { EmailDeliveryWarning } from '@/components/shared/email-delivery-warning'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { RichContent } from '@/components/public/rich-content'
import { Send, Users, MailWarning, KeyRound, Pencil } from 'lucide-react'
import { toast } from 'sonner'

type Audience = 'all' | 'unit'

// `embedded` = rendered inside the "Emails aux chefs" page (which owns the header).
export default function CommunicationsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [templateCode, setTemplateCode] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [unitId, setUnitId] = useState('') // only used when audience === 'unit'
  const [confirmOpen, setConfirmOpen] = useState(false)

  const scoutYear = useCurrentScoutYear()
  const { hasPermission, user } = useAuthStore()
  const canEditTemplates = !!user?.isSuperAdmin || hasPermission(PERMISSIONS.ASSOCIATIONS_MANAGE)

  const { data: templates } = useLeaderMessageTemplates()
  const { data: unitsPage } = useUnits({ isActive: true, pageSize: 100 })
  // Hold the fetch on "une unité" until a unit is actually picked.
  const recipientsEnabled = audience !== 'unit' || !!unitId
  const effectiveUnitId = audience === 'unit' ? unitId : ''
  const { data: recipients, isLoading } = useLeaderRecipients(effectiveUnitId || undefined, false, recipientsEnabled)
  const send = useSendLeaderMessage()

  const activeTemplates = templates ?? []
  const units = unitsPage?.items ?? []
  const selectedTemplate = activeTemplates.find((t) => t.code === templateCode)

  // "Modifier le texte pour cet envoi": a one-off copy of the template's subject/body, edited here and sent
  // instead of the template for THIS send only (the saved template never changes). Reset when the template changes.
  const [custom, setCustom] = useState<{ subject: string; body: string } | null>(null)
  const [customFor, setCustomFor] = useState(templateCode)
  if (customFor !== templateCode) { setCustomFor(templateCode); setCustom(null) }
  const subjectText = custom?.subject ?? selectedTemplate?.subject ?? ''
  const bodyText = custom?.body ?? selectedTemplate?.bodyHtml ?? ''
  const hasActivation = bodyText.includes('{{activationLink}}') || subjectText.includes('{{activationLink}}')
  // Placeholders the CG can insert in the one-off text (the same per-recipient values the send fills in).
  const EDIT_VARIABLES = [
    { key: 'leaderName', label: 'Nom du chef' }, { key: 'unitName', label: 'Unité(s)' },
    { key: 'scoutYear', label: 'Année scoute' }, { key: 'loginUrl', label: 'Adresse du site' },
    { key: 'username', label: 'Identifiant (lien d\'activation)' }, { key: 'activationLink', label: 'Lien d\'activation' },
    { key: 'expiryDays', label: 'Validité du lien (jours)' },
  ]

  // Selection: default-select every recipient with a contact email; reset (in render, not an effect) whenever the
  // recipient list changes — the codebase's derived-state-reset pattern (avoids set-state-in-effect).
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

  const total = recipients?.length ?? 0
  const withEmail = (recipients ?? []).filter((r) => r.contactEmail).length
  const selectedCount = selected.size
  const selectedNoEmail = (recipients ?? []).filter((r) => selected.has(r.memberId) && !r.contactEmail).length
  const willSend = selectedCount - selectedNoEmail // recipients that actually get an email
  const canSend = !!templateCode && willSend > 0

  // Fill {{variables}} with sample values so the CG sees a realistic preview (real values are per-recipient).
  const sampleRecipient = (recipients ?? []).find((r) => selected.has(r.memberId)) ?? recipients?.[0]
  const fillPreview = (html: string) => {
    const base = 'https://gndj.org'
    const v: Record<string, string> = {
      leaderName: sampleRecipient?.fullName ?? 'Prénom Nom',
      unitName: sampleRecipient?.units || 'Votre unité',
      scoutYear,
      username: 'prenom.nom@scouts.gndj',
      activationLink: `${base}/reset-password?token=…&setup=1`,
      expiryDays: '30',
      loginUrl: base,
    }
    return html.replace(/\{\{(\w+)\}\}/g, (_m, k) => v[k] ?? `{{${k}}}`)
  }

  const doSend = async () => {
    try {
      const res = await send.mutateAsync({
        templateCode, memberIds: [...selected],
        subjectOverride: custom ? custom.subject : null, bodyHtmlOverride: custom ? custom.body : null,
      })
      setConfirmOpen(false)
      // noAccount only applies to an activation-link template (recipients without a login can't get a set-password link).
      const extra = `${res.noEmail > 0 ? ` ${res.noEmail} sans email.` : ''}${res.noAccount > 0 ? ` ${res.noAccount} sans compte (accès non envoyé).` : ''}`
      if (res.sent > 0) toast.success(`${res.sent} message(s) envoyé(s).${extra}`)
      else toast.warning(`Aucun message envoyé.${extra}`)
    } catch (err) {
      toast.error(parseApiError(err))
    }
  }

  const audienceLabel = audience === 'unit'
    ? `l'unité ${units.find((u) => u.id === unitId)?.name ?? '(à choisir)'}`
    : 'toutes les maîtrises'

  return (
    <Page>
      {!embedded && (
        <PageHeader title="Envoyer un message aux chefs" icon={Send}
          description="Choisissez un modèle et les destinataires, prévisualisez, puis envoyez. Par exemple l'email d'accueil de rentrée. Les chefs sans email de contact sont ignorés." />
      )}
      <EmailDeliveryWarning />

      {/* Step 1 — template + step 2 — audience */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Modèle */}
        <div className="rounded-lg border p-4 space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Modèle d'email</Label>
          <Select value={templateCode} onValueChange={setTemplateCode}>
            <SelectTrigger><SelectValue placeholder="Choisir un modèle…" /></SelectTrigger>
            <SelectContent>
              {activeTemplates.map((t) => <SelectItem key={t.id} value={t.code}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedTemplate && (
            <div className="space-y-2">
              {hasActivation && (
                <div className="flex items-start gap-2 rounded-md border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 p-2.5 text-xs text-sky-800 dark:text-sky-300">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <span>Ce modèle inclut un <strong>lien d'activation</strong> : chaque chef recevra un lien pour
                    redéfinir son mot de passe. Les chefs ont déjà leur compte — retirez ce lien du modèle sauf besoin particulier.</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Modifier le texte pour cet envoi</div>
                  <div className="text-xs text-muted-foreground">Le modèle enregistré reste inchangé</div>
                </div>
                <Switch checked={!!custom}
                  onCheckedChange={(on) => setCustom(on ? { subject: selectedTemplate.subject, body: selectedTemplate.bodyHtml } : null)} />
              </div>
              {canEditTemplates && (
                <Link to="/admin/settings?tab=cfg:email-templates" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <Pencil className="h-3.5 w-3.5" /> Modifier le modèle lui-même
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Destinataires */}
        <div className="rounded-lg border p-4 space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Destinataires</Label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={audience === 'all' ? 'default' : 'outline'} onClick={() => setAudience('all')}>
              Toutes les maîtrises
            </Button>
            <Button type="button" size="sm" variant={audience === 'unit' ? 'default' : 'outline'} onClick={() => setAudience('unit')}>
              Une unité
            </Button>
          </div>
          {audience === 'unit' && (
            <Select value={unitId || undefined} onValueChange={setUnitId}>
              <SelectTrigger><SelectValue placeholder="Choisir une unité…" /></SelectTrigger>
              <SelectContent>
                {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {recipientsEnabled && !isLoading && (
            <p className="text-xs text-muted-foreground">
              {total} chef(s) · {withEmail} avec email
            </p>
          )}
        </div>
      </div>

      {/* One-off edit of the subject/body for this send */}
      {selectedTemplate && custom && (
        <div className="space-y-3 rounded-lg border p-4">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Texte de cet envoi</Label>
          <div className="space-y-1.5">
            <Label htmlFor="custom-subject">Objet</Label>
            <Input id="custom-subject" value={custom.subject} maxLength={300}
              onChange={(e) => setCustom((c) => c && { ...c, subject: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <RichTextEditor key={templateCode} content={custom.body} variables={EDIT_VARIABLES}
              onChange={(html) => setCustom((c) => c && { ...c, body: html })} />
          </div>
          <p className="text-xs text-muted-foreground">
            Les {'{{variables}}'} (nom, unité, lien…) sont remplies pour chaque chef. Ces changements ne valent que pour cet envoi.
          </p>
        </div>
      )}

      {/* Send action bar — kept at the top, above the (potentially long) recipient list */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-card">
        <div className="text-sm">
          {canSend
            ? <>Envoyer <span className="font-semibold">« {selectedTemplate?.name} »</span> à <span className="font-semibold">{willSend}</span> chef(s) de {audienceLabel}
                {selectedNoEmail > 0 && <span className="text-muted-foreground"> · {selectedNoEmail} sans email ignoré(s)</span>}</>
            : <span className="text-muted-foreground">Choisissez un modèle et au moins un destinataire avec email.</span>}
        </div>
        <Button onClick={() => setConfirmOpen(true)} disabled={!canSend || send.isPending} size="lg">
          <Send className="mr-2 h-4 w-4" /> Envoyer{willSend > 0 ? ` (${willSend})` : ''}
        </Button>
      </div>

      {/* Recipients (fine-tune) + preview (preview only appears once a template is chosen) */}
      <div className={cn('grid gap-4', selectedTemplate ? 'lg:grid-cols-3' : 'grid-cols-1')}>
        {/* Recipient list */}
        <div className={cn('space-y-2', selectedTemplate && 'lg:col-span-2')}>
          <p className="text-xs text-muted-foreground">Décochez un chef pour l'exclure de cet envoi.</p>
          {audience === 'unit' && !unitId ? (
            <EmptyState icon={Users} title="Choisissez une unité" description="Sélectionnez une unité ci-dessus pour voir ses chefs." />
          ) : isLoading ? (
            <LoadingSpinner variant="table" />
          ) : !recipients || recipients.length === 0 ? (
            <EmptyState icon={Users} title="Aucun chef" description="Aucun chef ne correspond à ces critères." />
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
                    <TableRow key={r.memberId} className={cn(selected.has(r.memberId) && 'bg-primary/5', !r.contactEmail && 'opacity-60')}>
                      <TableCell>
                        <input type="checkbox" checked={selected.has(r.memberId)} onChange={() => toggle(r.memberId)}
                          aria-label={`Sélectionner ${r.fullName}`} />
                      </TableCell>
                      <TableCell className="font-medium">{r.fullName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.units}</TableCell>
                      <TableCell className="text-sm">
                        {r.contactEmail
                          ? <span className="break-all">{r.contactEmail}</span>
                          : <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><MailWarning className="h-3.5 w-3.5" /> Aucun email</span>}
                      </TableCell>
                      <TableCell>
                        {!r.hasLoggedIn && (
                          <Badge variant="outline" className="border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">Jamais connecté</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Preview — only rendered once a template is selected */}
        {selectedTemplate && (
          <div className="lg:col-span-1">
            <div className="rounded-lg border lg:sticky lg:top-4">
              <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Aperçu{custom && <span className="ml-1 normal-case text-amber-700 dark:text-amber-300">· texte modifié</span>}
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-3">
                <p className="text-xs text-muted-foreground">Objet</p>
                <p className="mb-3 text-sm font-medium">{fillPreview(subjectText)}</p>
                <div className="border-t pt-3">
                  <RichContent html={fillPreview(bodyText)} className="text-sm" />
                </div>
                <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
                  Valeurs d'exemple — le contenu réel (nom, identifiant, lien) est personnalisé pour chaque chef.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Envoyer le message ?"
        description={`Envoyer « ${selectedTemplate?.name ?? ''} »${custom ? ' (texte modifié pour cet envoi)' : ''} à ${willSend} chef(s) de ${audienceLabel}${selectedNoEmail > 0 ? ` (${selectedNoEmail} sans email seront ignorés)` : ''}.${hasActivation ? ' Cet email inclut un lien d\'activation du compte.' : ''}`}
        confirmLabel="Envoyer"
        loading={send.isPending}
        onConfirm={doSend}
      />
    </Page>
  )
}
