import { Label } from '@/components/ui/label'

interface RequiredLabelProps {
  htmlFor?: string
  required?: boolean
  children: React.ReactNode
}

export function RequiredLabel({ htmlFor, required = false, children }: RequiredLabelProps) {
  return (
    <Label htmlFor={htmlFor}>
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  )
}
