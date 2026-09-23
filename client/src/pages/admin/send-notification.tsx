// CG tool: send a TARGETED notification (in-app bell + Web Push to devices) to a unit, a member group, or a
// hand-picked set of members. Group-manager only. Recipients see it in their notification bell and — if they
// enabled notifications on their device — as a push (even when the app is closed; on iPhone only when the app
// is installed). Perm maitrise.manage.
import { useState } from 'react'
import { useUnits } from '@/services/unit-service'
import { useMemberGroups } from '@/services/member-group-service'
import { useSendPushNotification, useNotificationBroadcasts, type NotificationBroadcast } from '@/services/notification-service'
import { MemberPickerDialog } from '@/components/shared/member-picker-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { SegmentedToggle } from '@/components/shared/segmented-toggle'
import { EmptyState } from '@/components/shared/empty-state'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { Bell, Plus, X, Send, History, Users, RotateCcw } from 'lucide-react'

type Audience = 'unit' | 'group' | 'members'

// Full date + time in French, e.g. "23 sept. 2026 à 14:35".
function formatSentAt(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function SendNotificationPage() {
  const [audience, setAudience] = useState<Audience>('unit')
  const [unitId, setUnitId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')

  const [historyPage, setHistoryPage] = useState(1)

  const { data: units } = useUnits({ isActive: true, pageSize: 100 })
  const { data: groups } = useMemberGroups()
  const send = useSendPushNotification()
  const { data: history, isLoading: historyLoading } = useNotificationBroadcasts(historyPage)

  const addMember = (m: { id: string; name: string }) => {
    setMembers((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
    setPickerOpen(false)
  }

  // "Renvoyer": pre-fill the compose form from a past send (audience + message), then scroll to the top so the
  // manager can EDIT before sending again. Nothing is sent until they press Envoyer.
  const resend = (b: NotificationBroadcast) => {
    if (b.unitId) { setAudience('unit'); setUnitId(b.unitId); setGroupId(''); setMembers([]) }
    else if (b.memberGroupId) { setAudience('group'); setGroupId(b.memberGroupId); setUnitId(''); setMembers([]) }
    else { setAudience('members'); setMembers(b.members ?? []); setUnitId(''); setGroupId('') }
    setTitle(b.title)
    setBody(b.body ?? '')
    setUrl(b.url ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    toast.info('Message préparé — modifiez-le puis envoyez.')
  }

  const audienceReady =
    (audience === 'unit' && !!unitId) ||
    (audience === 'group' && !!groupId) ||
    (audience === 'members' && members.length > 0)

  const submit = async () => {
    if (!title.trim()) { toast.error('Le titre est requis.'); return }
    if (!audienceReady) { toast.error('Choisissez les destinataires.'); return }
    try {
      const res = await send.mutateAsync({
        title: title.trim(),
        body: body.trim() || undefined,
        url: url.trim() || undefined,
        unitId: audience === 'unit' ? unitId : undefined,
        memberGroupId: audience === 'group' ? groupId : undefined,
        memberIds: audience === 'members' ? members.map((m) => m.id) : undefined,
      })
      toast.success(`Notification envoyée à ${res.count} destinataire(s)`)
      setTitle(''); setBody(''); setUrl('')
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  return (
    <Page className="mx-auto max-w-2xl">
      <PageHeader
        title="Envoyer une notification"
        icon={Bell}
        description="Envoie une notification aux membres choisis. Elle apparaît dans leur cloche de notifications et, s'ils ont activé les notifications sur leur appareil, sous forme de notification poussée (même application fermée ; sur iPhone uniquement si l'application est installée)."
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Destinataires</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <SegmentedToggle
            value={audience}
            onChange={setAudience}
            options={[
              { value: 'unit', label: 'Une unité' },
              { value: 'group', label: 'Un groupe' },
              { value: 'members', label: 'Membres choisis' },
            ]}
          />

          {audience === 'unit' && (
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger><SelectValue placeholder="Choisir une unité" /></SelectTrigger>
              <SelectContent>
                {units?.items.map((u) => <SelectItem key={u.id} value={u.id}>{u.code} — {u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {audience === 'group' && (
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue placeholder="Choisir un groupe" /></SelectTrigger>
              <SelectContent>
                {groups?.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.memberCount})</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {audience === 'members' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm">
                    {m.name}
                    <button type="button" onClick={() => setMembers((p) => p.filter((x) => x.id !== m.id))} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {members.length === 0 && <span className="text-sm text-muted-foreground">Aucun membre choisi.</span>}
              </div>
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />Ajouter un membre
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Message</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Titre</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Ex. : Réunion annulée demain" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Message <span className="font-normal text-muted-foreground">(optionnel)</span></label>
            <textarea className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Détails de la notification…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Lien <span className="font-normal text-muted-foreground">(optionnel — page ouverte au clic)</span></label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="/my-documents" />
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={send.isPending || !title.trim() || !audienceReady}>
              <Send className="mr-1.5 h-4 w-4" />{send.isPending ? 'Envoi…' : 'Envoyer'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History of manual sends — who sent what, to whom, when, and to how many. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />Historique des envois</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !history || history.items.length === 0 ? (
            <EmptyState icon={History} title="Aucun envoi" description="Aucune notification envoyée pour l'instant." />
          ) : (
            <div className="space-y-3">
              {history.items.map((b) => (
                <div key={b.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{b.title}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatSentAt(b.sentAt)}</span>
                  </div>
                  {b.body && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{b.body}</p>}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{b.recipientCount} destinataire(s)</span>
                      <span>{b.audienceLabel}</span>
                      <span>Par {b.sentByName}</span>
                      {b.url && <span className="font-mono">{b.url}</span>}
                    </div>
                    <Button variant="outline" size="sm" className="h-7" onClick={() => resend(b)}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />Renvoyer
                    </Button>
                  </div>
                </div>
              ))}
              {(historyPage > 1 || history.hasMore) && (
                <div className="flex items-center justify-between pt-1">
                  <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>Précédent</Button>
                  <span className="text-xs text-muted-foreground">Page {historyPage}</span>
                  <Button variant="outline" size="sm" disabled={!history.hasMore} onClick={() => setHistoryPage((p) => p + 1)}>Suivant</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <MemberPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={addMember}
        title="Ajouter un destinataire" description="Recherchez un membre à notifier." />
    </Page>
  )
}
