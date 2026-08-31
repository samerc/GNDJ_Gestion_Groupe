// Super-admin "Sessions actives" — who currently holds a live session (members/chefs + parent portal),
// how long they've been connected, their last activity, and a force-disconnect. The app uses a stateless
// 15-min access token + one rotating 7-day refresh token per account, so this shows ONE session per account
// (no per-device list) and "Déconnecter" takes effect within ≤15 min (access can't be revoked instantly).
import { useState } from 'react'
import { toast } from 'sonner'
import { useActiveSessions, useDisconnectSession, type ActiveSession } from '@/services/session-service'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { parseApiError } from '@/lib/error-utils'
import { Users, UserPlus, LogOut, Wifi, Info, type LucideIcon } from 'lucide-react'

// "il y a 3 min" / "il y a 2 h" / "il y a 1 j" — coarse relative time; '—' when null.
function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return "à l'instant"
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  return `il y a ${d} j`
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function SessionTable({
  title, icon: Icon, sessions, emptyLabel, onDisconnect, busyId,
}: {
  title: string
  icon: LucideIcon
  sessions: ActiveSession[]
  emptyLabel: string
  onDisconnect: (s: ActiveSession) => void
  busyId: string | null
}) {
  const online = sessions.filter((s) => s.isOnline).length
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <Icon className="h-5 w-5" />
          {title}
          <Badge variant="secondary">{sessions.length}</Badge>
          {online > 0 && (
            <Badge className="bg-emerald-100 text-emerald-700">
              <Wifi className="mr-1 h-3 w-3" />{online} en ligne
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState icon={Icon} title={emptyLabel} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">État</th>
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Identifiant</th>
                  <th className="px-3 py-2">Connecté depuis</th>
                  <th className="px-3 py-2">Dernière activité</th>
                  <th className="px-3 py-2">Session expire</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={s.id} className={`border-b align-middle ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                    <td className="px-3 py-2">
                      {s.isOnline ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />En ligne
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-slate-300" />Session ouverte
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.detail}</td>
                    <td className="px-3 py-2 whitespace-nowrap" title={fmt(s.loginAt)}>{timeAgo(s.loginAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap" title={fmt(s.lastActivityAt)}>{timeAgo(s.lastActivityAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmt(s.expiresAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="outline" size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={busyId === s.id}
                        onClick={() => onDisconnect(s)}
                      >
                        <LogOut className="mr-1 h-4 w-4" />Déconnecter
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SessionsPage() {
  const { data, isLoading, isError } = useActiveSessions()
  const disconnect = useDisconnectSession()
  const [confirm, setConfirm] = useState<ActiveSession | null>(null)

  const doDisconnect = async () => {
    if (!confirm) return
    const target = confirm
    try {
      await disconnect.mutateAsync({ kind: target.kind, id: target.id })
      toast.success(`${target.name} sera déconnecté(e) (effet sous 15 min).`)
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setConfirm(null)
    }
  }

  if (isLoading) return <LoadingSpinner variant="page" />
  if (isError || !data) return <EmptyState icon={Wifi} title="Impossible de charger les sessions" />

  const total = data.members.length + data.applicants.length
  const online = [...data.members, ...data.applicants].filter((s) => s.isOnline).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sessions actives</h1>
        <p className="text-sm text-muted-foreground">
          {total} session(s) ouverte(s) · {online} en ligne. La liste se rafraîchit automatiquement.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          « En ligne » correspond à une activité dans les {data.onlineWindowMinutes} dernières minutes (le compte
          reste ouvert jusqu'à l'expiration de la session, même hors ligne). « Déconnecter » invalide la session :
          la personne ne peut plus rester connectée et sera déconnectée dans un délai maximum de 15 minutes.
        </p>
      </div>

      <SessionTable
        title="Membres et chefs"
        icon={Users}
        sessions={data.members}
        emptyLabel="Aucun membre connecté"
        onDisconnect={setConfirm}
        busyId={disconnect.isPending ? confirm?.id ?? null : null}
      />

      <SessionTable
        title="Portail des parents (inscriptions)"
        icon={UserPlus}
        sessions={data.applicants}
        emptyLabel="Aucun parent connecté"
        onDisconnect={setConfirm}
        busyId={disconnect.isPending ? confirm?.id ?? null : null}
      />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Déconnecter cette session ?"
        description={
          confirm
            ? `${confirm.name} sera déconnecté(e). Sa session sera invalidée et son accès prendra fin dans un délai maximum de 15 minutes. Il/elle devra se reconnecter.`
            : ''
        }
        confirmLabel="Déconnecter"
        loading={disconnect.isPending}
        onConfirm={doDisconnect}
      />
    </div>
  )
}
