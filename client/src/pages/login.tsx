import { useState } from 'react'
import { Navigate, Link } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { usePublicSiteConfig } from '@/services/public-service'
import { LoginForm } from '@/components/auth/login-form'
import { AccountChooser } from '@/components/auth/account-chooser'
import { MemberAuthShell } from '@/components/auth/member-auth-shell'
import { LoginAnnouncement } from '@/components/login-announcement'
import { getDeviceAccounts } from '@/lib/device-accounts'

// "Espace membres" — login screen for existing members/chefs (JWT auth). Anonymous-only: an
// already-authenticated user is bounced to /dashboard.
//
// Google-style two-pane layout (MemberAuthShell): a constant branding pane on the left and an interactive pane
// on the right that shows either the « Choisir un compte » list (when this device has saved accounts) or the
// sign-in form, with any admin announcement above it.
export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { data: config } = usePublicSiteConfig()
  const inscriptionsOpen = config?.inscriptionsOpen ?? false

  // Saved accounts on this device (survives logout). If any, open on the chooser; else straight to the form.
  const [hasAccounts] = useState(() => getDeviceAccounts().length > 0)
  const [view, setView] = useState<'chooser' | 'form'>(hasAccounts ? 'chooser' : 'form')
  const [prefill, setPrefill] = useState('') // username carried from a chosen account with no live session

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <MemberAuthShell
      title={view === 'chooser' ? 'Choisir un compte' : 'Se connecter'}
      footerExtra={
        // Enrollment cross-link for parents (only while enrollment is open).
        inscriptionsOpen && (
          <p className="text-center text-sm text-muted-foreground">
            Vous souhaitez inscrire un enfant&nbsp;?{' '}
            <Link to="/inscription" className="font-medium text-accent underline-offset-2 hover:underline">
              Demande d'inscription →
            </Link>
          </p>
        )
      }
    >
      {config?.loginMessages?.map((m, i) => <LoginAnnouncement key={i} message={m} tone="primary" />)}
      {view === 'chooser' ? (
        <AccountChooser
          onUseAnother={() => { setPrefill(''); setView('form') }}
          onNeedAuth={(username) => { setPrefill(username); setView('form') }}
        />
      ) : (
        <LoginForm
          initialUsername={prefill}
          onBack={hasAccounts ? () => setView('chooser') : undefined}
        />
      )}
    </MemberAuthShell>
  )
}
