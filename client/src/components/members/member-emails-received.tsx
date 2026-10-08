// « Emails reçus » on a member's fiche (Contact & famille tab): every email the app sent — or is still trying to send —
// to an address on this member's file, so a chef can answer "did they get the email?" without opening the email queue.
// Collapsed by default; the list loads only when opened. Addresses that bounce are flagged (no more emails go there).
import { useState } from 'react'
import { ChevronDown, ChevronRight, Mail, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Callout } from '@/components/shared/callout'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { useMemberEmailsReceived } from '@/services/member-service'
import { formatDateTime } from '@/lib/utils'
import { parseApiError } from '@/lib/error-utils'

// Outbox states → badge (Pending = queued or waiting for a retry).
const STATUS = {
  Sent: { label: 'Envoyé', variant: 'success' },
  Pending: { label: 'En attente', variant: 'warning' },
  Failed: { label: 'Échec', variant: 'danger' },
} as const

export function MemberEmailsReceived({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false)
  // Fetched only once the card is opened.
  const { data, isLoading, error } = useMemberEmailsReceived(memberId, open)
  const bounced = data?.addresses.filter((a) => a.bounced) ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left">
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4 text-primary" />Emails reçus</CardTitle>
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        {!open && <p className="text-sm text-muted-foreground">Les emails envoyés par l'application à ce membre et à ses parents.</p>}
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {isLoading && <LoadingSpinner />}
          {error && <Callout tone="danger">{parseApiError(error)}</Callout>}
          {bounced.length > 0 && (
            <Callout tone="warning" icon={AlertTriangle} title="Adresse en échec">
              {bounced.map((a) => (
                <p key={a.address}>{a.address} ({a.owner}) : les emails n'arrivent pas, l'application ne lui écrit plus.{a.bounceReason ? ` ${a.bounceReason}` : ''}</p>
              ))}
            </Callout>
          )}
          {data && data.addresses.length === 0 && <p className="text-sm text-muted-foreground">Aucune adresse email sur la fiche : ajoutez un email au membre ou à un parent.</p>}
          {data && data.addresses.length > 0 && data.emails.length === 0 && (
            <p className="break-words text-sm text-muted-foreground">Aucun email envoyé à {data.addresses.map((a) => a.address).join(', ')}.</p>
          )}
          {data && data.emails.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {data.emails.map((e) => {
                const s = STATUS[e.status] ?? STATUS.Pending
                return (
                  <li key={e.id} className="space-y-0.5 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={s.variant}>{s.label}</Badge>
                      <span className="min-w-0 flex-1 break-words font-medium">{e.subject}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(e.sentAt ?? e.createdAt)}</span>
                    </div>
                    <p className="break-words text-xs text-muted-foreground">
                      {e.templateName} · à {e.toEmail}{e.owner ? ` (${e.owner})` : ''}
                    </p>
                    {e.lastError && <p className="break-words text-xs text-destructive">{e.lastError}</p>}
                  </li>
                )
              })}
            </ul>
          )}
          {/* The server returns at most the 100 most recent emails. */}
          {data && data.emails.length >= 100 && <p className="text-xs text-muted-foreground">Les 100 plus récents sont affichés.</p>}
        </CardContent>
      )}
    </Card>
  )
}
