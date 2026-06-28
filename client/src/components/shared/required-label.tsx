import { Label } from '@/components/ui/label'

interface RequiredLabelProps {
  htmlFor?: string
  required?: boolean
  children: React.ReactNode
}

// Field label that appends a red asterisk when the field is required.
export function RequiredLabel({ htmlFor, required = false, children }: RequiredLabelProps) {
  return (
    <Label htmlFor={htmlFor}>
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  )
}
