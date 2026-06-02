import { Navigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">GNDJ Scout</h1>
        <p className="text-muted-foreground">Gestion de Groupe Scout</p>
      </div>
      <LoginForm />
    </div>
  )
}
