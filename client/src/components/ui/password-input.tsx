import { forwardRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

// Password input with a show/hide eye toggle. Drop-in replacement for <Input type="password" />: forwards every
// prop to the underlying Input (value, onChange, id, name, required, autoComplete, autoFocus, disabled, …); the
// button flips the field between password and text. Reserves right padding so the typed value never sits under
// the eye. The toggle is tabIndex=-1 so it stays out of the tab order (password → submit).
type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, ...props }, ref,
) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input ref={ref} type={show ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        title={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-0 top-0 flex h-full items-center px-3 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
})
