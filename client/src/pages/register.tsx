import { Navigate } from 'react-router'
import { useAuthStore } from '@/stores/auth-store'
import { RegisterForm } from '@/components/auth/register-form'

// Legacy self-service account registration (kept wired but unused in normal flow —
// new members come through the applicant inscription portal instead). Anonymous-only.
export default function RegisterPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
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
