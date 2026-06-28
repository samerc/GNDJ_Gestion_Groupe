// Summary banner shown atop a form when one or more fields failed validation (paired with use-form-validation).
export function FormFieldErrors({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      Veuillez corriger les champs en erreur ci-dessous.
    </div>
  )
}
