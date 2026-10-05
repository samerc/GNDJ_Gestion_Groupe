import { useState } from 'react'
import { Mail, MailOpen, Reply, Trash2, Send, CornerUpLeft, MessageSquare, UserCheck, CheckCircle2, RotateCcw } from 'lucide-react'
import { useDebounce } from '@/hooks/use-debounce'
import {
  useContactMessages,
  useMarkContactMessageRead,
  useReplyContactMessage,
  useDeleteContactMessage,
  useRestoreContactMessage,
  useClaimContactMessage,
  useResolveContactMessage,
  type ContactMessageDto,
  type ContactMessageStatus,
} from '@/services/contact-message-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { EmailDeliveryWarning } from '@/components/shared/email-delivery-warning'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { SearchInput } from '@/components/shared/search-input'
import { SegmentedToggle } from '@/components/shared/segmented-toggle'
import { Callout } from '@/components/shared/callout'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/utils'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'
import { useEmailQueuedToast } from '@/hooks/use-email-queued-toast'

// In-app inbox for public contact-form submissions. Managers (content.manage) read, reply, and delete here
// instead of digging through email. Opening a message marks it read; "Répondre" queues a "Re:" email to the
// sender via the durable outbox (subject to the same delivery config as all app mail — hence the warning).
export default function ContactMessagesPage() {
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  // Default view = « À traiter » (not resolved yet); « Résolus » / « Tous » to look back.
  const [status, setStatus] = useState<ContactMessageStatus>('open')
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search, 400)

  const { data, isLoading } = useContactMessages({ search: debounced, unreadOnly, status, page })
  const markRead = useMarkContactMessageRead()
  const del = useDeleteContactMessage()
  const restore = useRestoreContactMessage()

  const [selected, setSelected] = useState<ContactMessageDto | null>(null)
  const [replyOpen, setReplyOpen] = useState(false)
  const [deleting, setDeleting] = useState<ContactMessageDto | null>(null)

  // Open a message → auto-mark read (so the unread badge clears) and show its detail dialog.
  const open = (m: ContactMessageDto) => {
    setSelected(m)
    setReplyOpen(false)
    if (!m.isRead) markRead.mutate({ id: m.id, read: true }, { onError: (e) => toast.error(parseApiError(e)) })
  }

  return (
    <Page size="wide">
      <PageHeader
        title="Messages de contact"
        icon={MessageSquare}
        description="Les messages envoyés depuis le formulaire de contact du site public. Ouvrez un message pour le lire, y répondre ou le marquer comme résolu."
      />

      <EmailDeliveryWarning />

      {/* Toolbar: search + unread filter + count */}
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedToggle<ContactMessageStatus>
          value={status}
          onChange={(v) => { setStatus(v); setPage(1) }}
          options={[
            { value: 'open', label: <>À traiter{typeof data?.openCount === 'number' ? ` (${data.openCount})` : ''}</> },
            { value: 'resolved', label: 'Résolus' },
            { value: 'all', label: 'Tous' },
          ]}
        />
        <SearchInput
          className="min-w-0 basis-full sm:basis-auto sm:flex-1"
          value={search}
          onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder="Rechercher (nom, email, sujet, message)…"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1) }}
            className="h-4 w-4 rounded border-input accent-primary" />
          Non lus uniquement
        </label>
        {typeof data?.unreadCount === 'number' && (
          <Badge variant="info">
            {data.unreadCount} non lu{data.unreadCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Aucun message"
          description={debounced || unreadOnly ? 'Aucun message ne correspond à ce filtre.'
            : status === 'open' ? 'Tous les messages ont été traités.'
            : status === 'resolved' ? "Aucun message n'a encore été marqué comme résolu."
            : "Vous n'avez pas encore reçu de message de contact."} />
      ) : (
        <div className="space-y-2">
          {data.items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => open(m)}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left shadow-2xs transition-colors hover:border-primary/30 ${
                m.isRead ? 'bg-card' : 'border-primary/30 bg-primary/5'
              } ${m.resolvedAt ? 'opacity-75' : ''}`}
            >
              <span className="mt-0.5 shrink-0 text-muted-foreground">
                {m.isRead ? <MailOpen className="h-5 w-5" /> : <Mail className="h-5 w-5 text-primary" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className={`truncate ${m.isRead ? 'font-medium' : 'font-semibold'}`}>{m.senderName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                </div>
                <p className={`truncate text-sm ${m.isRead ? 'text-foreground' : 'font-medium text-foreground'}`}>{m.subject}</p>
                <p className="truncate text-xs text-muted-foreground">{m.message}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{m.senderEmail}</span>
                  {m.claimedByName && (
                    <Badge variant="warning" className="gap-1">
                      <UserCheck className="h-3 w-3" /> {m.claimedByName}
                    </Badge>
                  )}
                  {m.resolvedAt && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Résolu
                    </Badge>
                  )}
                  {m.repliedAt && (
                    <Badge variant="success" className="gap-1">
                      <CornerUpLeft className="h-3 w-3" /> Répondu
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}

          {/* Pagination */}
          {(page > 1 || data.hasMore) && (
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</Button>
              <span className="text-xs text-muted-foreground">Page {page}</span>
              <Button variant="outline" size="sm" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
            </div>
          )}
        </div>
      )}

      {/* Detail dialog */}
      <MessageDialog
        message={selected}
        replyOpen={replyOpen}
        onClose={() => setSelected(null)}
        onReplyToggle={setReplyOpen}
        onMarkUnread={() => selected && markRead.mutate({ id: selected.id, read: false }, {
          onSuccess: () => { toast.success('Message marqué comme non lu'); setSelected(null) },
          onError: (e) => toast.error(parseApiError(e)),
        })}
        onDelete={() => { if (selected) { setDeleting(selected); setSelected(null) } }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Supprimer ce message ?"
        description={deleting ? `Le message de ${deleting.senderName} sera retiré de la boîte de réception.` : ''}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, {
          onSuccess: () => {
            const id = deleting.id
            toast.success('Message supprimé', {
              action: {
                label: 'Annuler',
                onClick: () => restore.mutate(id, {
                  onSuccess: () => toast.success('Suppression annulée'),
                  onError: (e) => toast.error(parseApiError(e)),
                }),
              },
            })
            setDeleting(null)
          },
          onError: (e) => toast.error(parseApiError(e)),
        })}
      />
    </Page>
  )
}

// Detail + reply composer. Shows the full message; "Répondre" reveals a subject (defaulted to "Re: …") + body.
function MessageDialog({
  message, replyOpen, onClose, onReplyToggle, onMarkUnread, onDelete,
}: {
  message: ContactMessageDto | null
  replyOpen: boolean
  onClose: () => void
  onReplyToggle: (open: boolean) => void
  onMarkUnread: () => void
  onDelete: () => void
}) {
  const emailToast = useEmailQueuedToast()
  const reply = useReplyContactMessage()
  const claim = useClaimContactMessage()
  const resolve = useResolveContactMessage()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  // Reset the composer whenever a new message opens / the reply panel toggles.
  const [seedFor, setSeedFor] = useState<string | null>(null)
  if (message && replyOpen && seedFor !== message.id) {
    setSeedFor(message.id)
    setSubject(message.subject.startsWith('Re:') ? message.subject : `Re: ${message.subject}`)
    setBody('')
  }
  if (!replyOpen && seedFor !== null) setSeedFor(null)

  if (!message) return null

  // The sender may have typed their login username instead of a real email. The backend resolves the address a
  // reply would actually reach: replyToEmail = the real email (may differ from senderEmail), or null when the
  // username has no real email on file (can't reply by email).
  const replyTo = message.replyToEmail
  const emailMismatch = !!replyTo && replyTo.trim().toLowerCase() !== message.senderEmail.trim().toLowerCase()
  const noReplyEmail = !replyTo

  // "Je m'en occupe" / "Libérer" — who is handling the message.
  const setClaim = (on: boolean) => claim.mutate({ id: message.id, claim: on }, {
    onSuccess: () => toast.success(on ? 'Message attribué' : 'Message libéré'),
    onError: (e) => toast.error(parseApiError(e)),
  })

  // Résolu (no reply needed) / Rouvrir. Closes the dialog: the message leaves (or re-enters) « À traiter ».
  const setResolved = (on: boolean) => resolve.mutate({ id: message.id, resolved: on }, {
    onSuccess: () => { toast.success(on ? 'Message marqué comme résolu' : 'Message rouvert'); onClose() },
    onError: (e) => toast.error(parseApiError(e)),
  })

  const send = () => {
    reply.mutate({ id: message.id, subject, body }, {
      onSuccess: () => { emailToast("Réponse mise en file d'envoi pour " + (replyTo ?? message.senderEmail)); onClose() },
      onError: (e) => toast.error(parseApiError(e)),
    })
  }

  return (
    <Dialog open={!!message} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">{message.subject}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Sender + date */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{message.senderName}</p>
              <a href={`mailto:${replyTo ?? message.senderEmail}`} className="text-primary hover:underline">{message.senderEmail}</a>
              {emailMismatch && <span className="ml-1 text-xs text-muted-foreground">(→ {replyTo})</span>}
            </div>
            <span className="text-xs text-muted-foreground">{formatDateTime(message.createdAt)}</span>
          </div>

          {/* Resolved banner — dealt with (with or without a reply). */}
          {message.resolvedAt && (
            <Callout tone="success" icon={CheckCircle2}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Résolu le {formatDateTime(message.resolvedAt)}{message.resolvedByName ? <> par <span className="font-medium">{message.resolvedByName}</span></> : null}</span>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={resolve.isPending}
                  onClick={() => setResolved(false)}><RotateCcw className="mr-1 h-3 w-3" />Rouvrir</Button>
              </div>
            </Callout>
          )}

          {/* Claim banner — who's handling this message. */}
          {message.claimedByName && (
            <Callout tone="warning" icon={UserCheck}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>En cours de traitement par <span className="font-medium">{message.claimedByName}</span></span>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={claim.isPending}
                  onClick={() => setClaim(false)}>{claim.isPending ? 'Enregistrement…' : 'Libérer'}</Button>
              </div>
            </Callout>
          )}

          {/* Message body */}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.message}</p>

          {/* Every reply already sent (oldest first) — a new reply is added, it never replaces an earlier one. */}
          {(message.replies ?? []).map((r) => (
            <Callout key={r.id} tone="success" icon={CornerUpLeft}
              title={<>Réponse du {formatDateTime(r.createdAt)}
                {r.repliedByName && <span className="font-normal"> par {r.repliedByName}</span>}
                <span className="font-normal text-muted-foreground"> → {r.sentTo}</span></>}>
              <p className="font-medium">{r.subject}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{r.body}</p>
            </Callout>
          ))}

          {/* Reply composer */}
          {replyOpen && (
            <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              {(message.replies?.length ?? 0) > 0 && (() => {
                const last = message.replies[message.replies.length - 1]
                return (
                  <Callout tone="warning">
                    Une réponse a déjà été envoyée le {formatDateTime(last.createdAt)}{last.repliedByName ? ` par ${last.repliedByName}` : ''}. Celle-ci sera envoyée en plus et gardée dans l'historique.
                  </Callout>
                )
              })()}
              <div className="space-y-1.5">
                <Label htmlFor="reply-subject">Objet</Label>
                <Input id="reply-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reply-body">Message</Label>
                <Textarea
                  id="reply-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  maxLength={10000}
                  placeholder={`Bonjour ${message.senderName},\n\n…`}
                  className="min-h-[8rem]"
                />
              </div>
              {noReplyEmail ? (
                <Callout tone="warning">
                  Impossible de répondre par email : l'expéditeur a saisi son identifiant de connexion
                  ({message.senderEmail}) et aucune adresse email réelle n'est enregistrée sur sa fiche. Ajoutez
                  une adresse à sa fiche, puis réessayez.
                </Callout>
              ) : emailMismatch ? (
                <Callout tone="warning">
                  L'expéditeur a saisi son identifiant de connexion ({message.senderEmail}). La réponse sera
                  envoyée à son adresse réelle : <span className="font-medium">{replyTo}</span>.
                </Callout>
              ) : (
                <p className="text-xs text-muted-foreground">La réponse sera envoyée par email à {replyTo}.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {!message.claimedByName && (
              <Button variant="outline" size="sm" disabled={claim.isPending}
                onClick={() => setClaim(true)}>
                <UserCheck className="mr-1.5 h-4 w-4" />Je m'en occupe
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onMarkUnread}>Marquer comme non lu</Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" />Supprimer
            </Button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {!replyOpen ? (
              <>
                {!message.resolvedAt && (
                  <Button variant="success" disabled={resolve.isPending} onClick={() => setResolved(true)}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />Marquer comme résolu
                  </Button>
                )}
                <Button onClick={() => onReplyToggle(true)}><Reply className="mr-1.5 h-4 w-4" />Répondre</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => onReplyToggle(false)}>Annuler</Button>
                <Button onClick={send} disabled={reply.isPending || !subject.trim() || !body.trim() || noReplyEmail}>
                  <Send className="mr-1.5 h-4 w-4" />{reply.isPending ? 'Envoi…' : 'Envoyer la réponse'}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

