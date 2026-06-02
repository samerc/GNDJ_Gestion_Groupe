import { Navigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { RegisterForm } from '@/components/auth/register-form'

export default function RegisterPage() {
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
      <RegisterForm />
    </div>
  )
}
