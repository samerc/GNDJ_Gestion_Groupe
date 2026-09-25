import { useState } from 'react'
import { useNavigate } from 'react-router'
import { X, UserPlus, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { getDeviceAccounts, removeDeviceAccount, type DeviceAccount } from '@/lib/device-accounts'

// Google-style « Choisir un compte »: lists the accounts previously used on THIS device (from
// lib/device-accounts — identity only, survives logout). Clicking one signs in instantly via the pooled
// session if it's still live (switchToAccount), otherwise falls through to the form with the username
// pre-filled so the member re-authenticates with their password or an email code. Each row can be removed.
export function AccountChooser({ onUseAnother, onNeedAuth }: {
  onUseAnother: () => void              // « Utiliser un autre compte » → blank form
  onNeedAuth: (username: string) => void // chosen account has no live session → form with username prefilled
}) {
  const navigate = useNavigate()
  const switchToAccount = useAuthStore((s) => s.switchToAccount)
  const [list, setList] = useState<DeviceAccount[]>(() => getDeviceAccounts())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const choose = async (a: DeviceAccount) => {
    setBusyId(a.memberId)
    setError('')
    try {
      await switchToAccount(a.memberId) // mint a fresh session from the pooled refresh token (no password)
      navigate('/dashboard', { replace: true })
    } catch {
      // No live session (logged out / token expired) → re-auth with the username pre-filled.
      onNeedAuth(a.username)
    } finally {
      setBusyId(null)
    }
  }

  const remove = (memberId: string) => {
    removeDeviceAccount(memberId)
    const next = list.filter((x) => x.memberId !== memberId)
    setList(next)
    if (next.length === 0) onUseAnother() // nothing left to choose → straight to the form
  }

  return (
    <div className="space-y-1">
      {error && <div className="mb-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {list.map((a) => (
        // A DIV row with two sibling buttons (choose / remove) — never a button inside a button.
        <div key={a.memberId} className="group flex items-center gap-1 rounded-lg transition-colors hover:bg-muted">
          <button
            type="button"
            onClick={() => choose(a)}
            disabled={!!busyId}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left disabled:opacity-60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(a.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{a.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.username}</span>
            </span>
            {busyId === a.memberId
              ? <span className="shrink-0 text-xs text-muted-foreground">Connexion…</span>
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
          </button>
          <button
            type="button"
            onClick={() => remove(a.memberId)}
            disabled={!!busyId}
            aria-label={`Retirer ${a.name}`}
            title="Retirer ce compte de cet appareil"
            className="mr-1 shrink-0 rounded-full p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted-foreground/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* Sign in with a different account (blank form). */}
      <button
        type="button"
        onClick={onUseAnother}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UserPlus className="h-4 w-4" />
        </span>
        <span className="text-sm font-medium">Utiliser un autre compte</span>
      </button>
    </div>
  )
}

// First + last initial for the avatar.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (a + b).toUpperCase() || '?'
}
