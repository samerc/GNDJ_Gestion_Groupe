import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Bell, FileText, ClipboardCheck, UserPlus, PauseCircle, Check } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useUnreadNotificationCount, useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead,
  type NotificationDto, type NotificationType,
} from '@/services/notification-service'

// Icon + accent colour per category.
const META: Record<NotificationType, { icon: typeof Bell; cls: string }> = {
  document: { icon: FileText, cls: 'text-blue-600 bg-blue-100' },
  change_request: { icon: ClipboardCheck, cls: 'text-amber-600 bg-amber-100' },
  demande: { icon: UserPlus, cls: 'text-teal-600 bg-teal-100' },
  hold: { icon: PauseCircle, cls: 'text-red-600 bg-red-100' },
  info: { icon: Bell, cls: 'text-slate-600 bg-slate-100' },
}

// Compact French relative time ("il y a 3 min", "hier", "il y a 5 j").
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const s = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'hier'
  if (d < 30) return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// The header bell: an unread badge + a dropdown of recent notifications. Clicking one navigates to its target
// and marks it read. Shown to every logged-in user (the top bar is rendered for all roles).
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data: unread = 0 } = useUnreadNotificationCount()
  const { data, isLoading } = useNotifications(open) // list fetched only while the dropdown is open
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()

  const items = data?.items ?? []

  const openItem = (n: NotificationDto) => {
    if (!n.isRead) markRead.mutate(n.id)
    setOpen(false)
    if (n.linkUrl) navigate(n.linkUrl)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <Check className="h-3.5 w-3.5" />Tout marquer comme lu
            </button>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto sm:max-h-96">
          {isLoading ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-muted-foreground">
              <Bell className="h-8 w-8 opacity-40" />
              <p className="text-sm">Aucune notification</p>
            </div>
          ) : (
            items.map((n) => {
              const meta = META[n.type] ?? META.info
              const Icon = meta.icon
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn(
                    'flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/60',
                    !n.isRead && 'bg-primary/5',
                  )}
                >
                  <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', meta.cls)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn('truncate text-sm', !n.isRead ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                      {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
