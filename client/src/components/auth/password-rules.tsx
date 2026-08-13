// Shows the configurable password-complexity rules as a live checklist that ticks off as the user types.
// The policy + check helpers live in lib/password-policy (so this file stays components-only for fast-refresh).
import { usePasswordPolicy, checkPassword } from '@/lib/password-policy'
import { Check, X } from 'lucide-react'

export function PasswordRules({ password }: { password: string }) {
  const { data: policy } = usePasswordPolicy()
  if (!policy) return null
  const rules = checkPassword(password, policy)
  return (
    <ul className="space-y-1 text-xs" aria-label="Exigences du mot de passe">
      {rules.map((r) => (
        <li key={r.label} className={`flex items-center gap-1.5 ${r.ok ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {r.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 opacity-50" />}
          {r.label}
        </li>
      ))}
    </ul>
  )
}
