import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { UserPlus, KeyRound, Mail, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { usePublicSiteConfig } from '@/services/public-service'
import { emailDomain } from '@/lib/email-domain'
import apiClient from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { HoneypotField } from '@/components/shared/honeypot-field'
import { parseApiError } from '@/lib/error-utils'
import type { AxiosError } from 'axios'
import type { ApiError } from '@/types/api'

// Result of POST /auth/request-login-code (passwordless step 1).
interface LoginCodeRequestResult { found: boolean; hasEmail: boolean; maskedEmail: string | null }

// The member/chef sign-in form (rendered inside the /login two-pane shell — no Card of its own; the title
// lives in the shell's left pane). Two modes: password (default) and a passwordless "code par email" flow.
// `initialUsername` pre-fills the identifier (e.g. coming from the account chooser). `onBack` — when there are
// saved accounts on this device — shows a link back to the « Choisir un compte » screen.
export function LoginForm({ initialUsername = '', onBack }: { initialUsername?: string; onBack?: () => void }) {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const loginWithCode = useAuthStore((s) => s.loginWithCode)
  const { data: config } = usePublicSiteConfig()
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [email, setEmail] = useState(initialUsername) // the username (shared by both modes)
  const [password, setPassword] = useState('')
  const [website, setWebsite] = useState('') // honeypot — must stay empty (bots fill it → server rejects)
  const [rememberMe, setRememberMe] = useState(true) // "Rester connecté" — default ON
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0) // 3 consecutive failures → offer a password reset

  // Code-mode state.
  const [codeSent, setCodeSent] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
  const [code, setCode] = useState('')

  // A personal-email domain → probably a parent on the wrong screen: suggest the demandes portal (enrollment open).
  const domain = emailDomain(email)
  const userDomain = config?.userDomain?.toLowerCase()
  const suggestDemandes = !!config?.inscriptionsOpen && !!userDomain && domain.includes('.') && domain !== userDomain

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await login({ email, password, website }, rememberMe)
      setFailedAttempts(0); navigate('/dashboard')
    } catch (err) {
      setError((err as AxiosError<ApiError>).response?.data?.error ?? 'Une erreur est survenue.')
      setFailedAttempts((n) => n + 1)
    } finally { setLoading(false) }
  }

  // Code mode — step 1: email a code to the account's main contact address.
  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const { data } = await apiClient.post<LoginCodeRequestResult>('/auth/request-login-code', { username: email, website })
      if (!data.found) { setError("Aucun compte ne correspond à cet identifiant."); return }
      if (!data.hasEmail) { setError("Aucune adresse email enregistrée pour ce compte — utilisez votre mot de passe ou contactez la maîtrise."); return }
      setMaskedEmail(data.maskedEmail); setCodeSent(true)
    } catch (err) { setError(parseApiError(err)) } finally { setLoading(false) }
  }

  // Code mode — step 2: verify the code and sign in.
  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await loginWithCode(email, code, rememberMe); navigate('/dashboard')
    } catch (err) {
      setError((err as AxiosError<ApiError>).response?.data?.error ?? 'Une erreur est survenue.')
    } finally { setLoading(false) }
  }

  const switchToCode = () => { setMode('code'); setError(''); setCodeSent(false); setCode(''); setMaskedEmail(null) }
  const switchToPassword = () => { setMode('password'); setError('') }

  const usernameField = (
    <div className="space-y-1.5">
      <Label htmlFor="email">Nom d'utilisateur</Label>
      <Input
        id="email" name="username" type="text" inputMode="email"
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="prenom.nom@scouts.gndj"
        value={email} onChange={(e) => setEmail(e.target.value)}
        required autoComplete="username" autoFocus
        disabled={mode === 'code' && codeSent}
      />
      <p className="text-xs text-muted-foreground">
        Format : <span className="font-medium">prénom.nom@scouts.gndj</span> (pas votre email personnel).
      </p>
      {suggestDemandes && (
        <Link to="/inscription/login" className="mt-1 flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent-foreground/90">
          <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <span>Vous inscrivez un enfant&nbsp;? <span className="font-medium text-accent underline-offset-2 hover:underline">Aller au portail des demandes →</span></span>
        </Link>
      )}
    </div>
  )

  const errorBox = error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
  const backLink = onBack && (
    <button type="button" onClick={onBack} className="mb-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" /> Comptes enregistrés
    </button>
  )
  const rememberBox = (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
      <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
      Rester connecté sur cet appareil
    </label>
  )

  // ─── PASSWORD MODE ───
  if (mode === 'password') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <HoneypotField value={website} onChange={setWebsite} />
        {backLink}
        {errorBox}
        {usernameField}
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <PasswordInput id="password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        {rememberBox}
        {failedAttempts >= 3 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Vous n'arrivez pas à vous connecter&nbsp;?{' '}
              <Link to="/forgot-password" className="font-medium underline underline-offset-2">Réinitialiser le mot de passe</Link>{' '}ou{' '}
              <Link to="/forgot-username" className="font-medium underline underline-offset-2">retrouver l'identifiant</Link>.
            </span>
          </div>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </Button>
        {/* Recovery links — compact single row, de-emphasized. */}
        <div className="flex items-center justify-center gap-2 text-center text-sm">
          <Link to="/forgot-password" className="text-primary hover:underline">Mot de passe oublié&nbsp;?</Link>
          <span className="text-muted-foreground/50">·</span>
          <Link to="/forgot-username" className="text-primary hover:underline">Identifiant oublié&nbsp;?</Link>
        </div>
        {/* "ou" divider + the passwordless option (slim, explained by its caption). */}
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center"><span className="bg-card px-2 text-xs text-muted-foreground">ou</span></div>
        </div>
        <Button type="button" onClick={switchToCode} className="w-full bg-teal-600 text-white hover:bg-teal-700">
          <Mail className="mr-2 h-4 w-4" /> Se connecter avec un code
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Recevez un code par email — pratique pour une première connexion ou un mot de passe oublié.
        </p>
      </form>
    )
  }

  // ─── CODE MODE — step 1 (enter username) ───
  if (!codeSent) {
    return (
      <form onSubmit={requestCode} className="space-y-4">
        <HoneypotField value={website} onChange={setWebsite} />
        <button type="button" onClick={switchToPassword} className="mb-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Utiliser le mot de passe
        </button>
        {errorBox}
        {usernameField}
        <p className="text-xs text-muted-foreground">Nous enverrons un code à 6 chiffres à l'adresse email enregistrée sur le dossier.</p>
        <Button type="submit" className="w-full bg-teal-600 text-white hover:bg-teal-700" disabled={loading}>
          {loading ? 'Envoi...' : 'Envoyer le code'}
        </Button>
      </form>
    )
  }

  // ─── CODE MODE — step 2 (enter code) ───
  return (
    <form onSubmit={verifyCode} className="space-y-4">
      {errorBox}
      <div className="rounded-md border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
          <span>Un code a été envoyé à <span className="font-medium">{maskedEmail}</span>. Entrez-le ci-dessous (valable 15 minutes).</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="code">Code de connexion</Label>
        <Input
          id="code" name="one-time-code" type="text" inputMode="numeric" autoComplete="one-time-code"
          autoFocus maxLength={6} placeholder="123456"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required
          className="text-center text-lg tracking-[0.3em]"
        />
      </div>
      {rememberBox}
      <Button type="submit" className="w-full bg-teal-600 text-white hover:bg-teal-700" disabled={loading || code.length < 6}>
        {loading ? 'Connexion...' : 'Se connecter'}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => { setCodeSent(false); setCode(''); setError('') }} className="text-primary hover:underline">Modifier l'identifiant</button>
        <button type="button" onClick={requestCode} disabled={loading} className="text-primary hover:underline disabled:opacity-50">Renvoyer le code</button>
      </div>
      <button type="button" onClick={switchToPassword} className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Utiliser le mot de passe
      </button>
    </form>
  )
}
