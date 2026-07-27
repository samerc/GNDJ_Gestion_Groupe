import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reportClientError } from '@/lib/error-report'

// Catches render-time crashes anywhere below it so the user sees a clear, reassuring page instead of a
// white screen — and auto-reports the crash to the backend (which alerts the super-admin) and shows the
// user the same reference. Error boundaries MUST be class components (React has no hook equivalent).
interface Props { children: ReactNode }
interface State { hasError: boolean; errorId: string | null; reporting: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorId: null, reporting: false }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ reporting: true })
    reportClientError({
      message: error?.message || String(error),
      detail: `${error?.stack ?? ''}\n\nComponent stack:${info?.componentStack ?? ''}`,
      url: window.location.href,
    }).then((errorId) => this.setState({ errorId, reporting: false }))
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Une erreur inattendue s'est produite</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Désolé, quelque chose s'est mal passé sur cette page. Notre équipe a été prévenue automatiquement
          et va s'en occuper. Vous pouvez recharger la page ou revenir à l'accueil.
        </p>
        {this.state.reporting && <p className="mt-3 text-xs text-muted-foreground">Signalement en cours…</p>}
        {this.state.errorId && (
          <p className="mt-3 rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
            Référence : {this.state.errorId}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => window.location.reload()}>Recharger la page</Button>
          <Button variant="outline" onClick={() => { window.location.href = '/' }}>Retour à l'accueil</Button>
        </div>
      </div>
    )
  }
}
