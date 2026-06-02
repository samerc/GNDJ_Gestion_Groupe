export function FormFieldErrors({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      Veuillez vérifier les champs marqués en rouge.
    </div>
  )
}
