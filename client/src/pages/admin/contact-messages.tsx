import { useState } from 'react'
import { Mail, MailOpen, Search, X, Reply, Trash2, Send, CornerUpLeft, MessageSquare } from 'lucide-react'
import { useDebounce } from '@/hooks/use-debounce'
import {
  useContactMessages,
  useMarkContactMessageRead,
  useReplyContactMessage,
  useDeleteContactMessage,
  type ContactMessageDto,
} from '@/services/contact-message-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { EmailDeliveryWarning } from '@/components/shared/email-delivery-warning'
import { parseApiError } from '@/lib/error-utils'
import { toast } from 'sonner'

// In-app inbox for public contact-form submissions. Managers (content.manage) read, reply, and delete here
// instead of digging through email. Opening a message marks it read; "Répondre" queues a "Re:" email to the
// sender via the durable outbox (subject to the same delivery config as all app mail — hence the warning).
export default function ContactMessagesPage() {
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search, 400)

  const { data, isLoading } = useContactMessages({ search: debounced, unreadOnly, page })
  const markRead = useMarkContactMessageRead()
  const del = useDeleteContactMessage()

  const [selected, setSelected] = useState<ContactMessageDto | null>(null)
  const [replyOpen, setReplyOpen] = useState(false)
  const [deleting, setDeleting] = useState<ContactMessageDto | null>(null)

  // Open a message → auto-mark read (so the unread badge clears) and show its detail dialog.
  const open = (m: ContactMessageDto) => {
    setSelected(m)
    setReplyOpen(false)
    if (!m.isRead) markRead.mutate({ id: m.id, read: true })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Messages de contact</h1>
        <p className="text-sm text-muted-foreground">
          Les messages envoyés depuis le formulaire de contact du site public. Ouvrez un message pour le lire et y répondre.
        </p>
      </div>

      <EmailDeliveryWarning />

      {/* Toolbar: search + unread filter + count */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Rechercher (nom, email, sujet, message)…"
            className="pl-9 pr-9"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(''); setPage(1) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Effacer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1) }}
            className="h-4 w-4 rounded border-input accent-primary" />
          Non lus uniquement
        </label>
        {typeof data?.unreadCount === 'number' && (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {data.unreadCount} non lu{data.unreadCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner variant="table" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Aucun message"
          description={debounced || unreadOnly ? 'Aucun message ne correspond à ce filtre.' : "Vous n'avez pas encore reçu de message de contact."} />
      ) : (
        <div className="space-y-2">
          {data.items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => open(m)}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left shadow-2xs transition-colors hover:border-primary/30 ${
                m.isRead ? 'bg-card' : 'border-primary/30 bg-primary/5'
              }`}
            >
              <span className="mt-0.5 shrink-0 text-muted-foreground">
                {m.isRead ? <MailOpen className="h-5 w-5" /> : <Mail className="h-5 w-5 text-primary" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className={`truncate ${m.isRead ? 'font-medium' : 'font-semibold'}`}>{m.senderName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmt(m.createdAt)}</span>
                </div>
                <p className={`truncate text-sm ${m.isRead ? 'text-foreground' : 'font-medium text-foreground'}`}>{m.subject}</p>
                <p className="truncate text-xs text-muted-foreground">{m.message}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{m.senderEmail}</span>
                  {m.repliedAt && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <CornerUpLeft className="h-3 w-3" /> Répondu
                    </span>
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
        onMarkUnread={() => selected && markRead.mutate({ id: selected.id, read: false }, { onSuccess: () => setSelected(null) })}
        onDelete={() => { if (selected) { setDeleting(selected); setSelected(null) } }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Supprimer ce message ?"
        description={deleting ? `Le message de ${deleting.senderName} sera supprimé définitivement de la boîte de réception.` : ''}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting.id, {
          onSuccess: () => { toast.success('Message supprimé'); setDeleting(null) },
          onError: (e) => toast.error(parseApiError(e)),
        })}
      />
    </div>
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
  const reply = useReplyContactMessage()
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

  const send = () => {
    reply.mutate({ id: message.id, subject, body }, {
      onSuccess: () => { toast.success('Réponse envoyée à ' + message.senderEmail); onClose() },
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
              <a href={`mailto:${message.senderEmail}`} className="text-primary hover:underline">{message.senderEmail}</a>
            </div>
            <span className="text-xs text-muted-foreground">{fmt(message.createdAt)}</span>
          </div>

          {/* Message body */}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.message}</p>

          {/* Previous reply (if any) */}
          {message.repliedAt && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CornerUpLeft className="h-3.5 w-3.5" /> Réponse envoyée le {fmt(message.repliedAt)}
              </p>
              {message.replySubject && <p className="font-medium">{message.replySubject}</p>}
              {message.replyBody && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{message.replyBody}</p>}
            </div>
          )}

          {/* Reply composer */}
          {replyOpen && (
            <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="reply-subject">Objet</Label>
                <Input id="reply-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reply-body">Message</Label>
                <textarea
                  id="reply-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  maxLength={10000}
                  placeholder={`Bonjour ${message.senderName},\n\n…`}
                  className="flex min-h-[8rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <p className="text-xs text-muted-foreground">La réponse sera envoyée par email à {message.senderEmail}.</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={onMarkUnread}>Marquer comme non lu</Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" />Supprimer
            </Button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {!replyOpen ? (
              <Button onClick={() => onReplyToggle(true)}><Reply className="mr-1.5 h-4 w-4" />Répondre</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => onReplyToggle(false)}>Annuler</Button>
                <Button onClick={send} disabled={reply.isPending || !subject.trim() || !body.trim()}>
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

// Short French date-time (browser locale-independent formatting via explicit parts).
function fmt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
