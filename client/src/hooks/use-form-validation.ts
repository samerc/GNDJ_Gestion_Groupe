import { useState, useCallback } from 'react'

export function useFormValidation() {
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

  const validate = useCallback((rules: Record<string, boolean>): boolean => {
    const errors = new Set<string>()
    for (const [field, isInvalid] of Object.entries(rules)) {
      if (isInvalid) errors.add(field)
    }
    setFieldErrors(errors)
    return errors.size === 0
  }, [])

  const clearField = useCallback((field: string) => {
    setFieldErrors(prev => {
      if (!prev.has(field)) return prev
      const next = new Set(prev)
      next.delete(field)
      return next
    })
  }, [])

  const clearAll = useCallback(() => setFieldErrors(new Set()), [])

  const fieldClass = useCallback((field: string) =>
    fieldErrors.has(field) ? 'border-destructive ring-destructive' : ''
  , [fieldErrors])

  const hasError = useCallback((field: string) => fieldErrors.has(field), [fieldErrors])

  const hasErrors = fieldErrors.size > 0

  return { fieldErrors, validate, clearField, clearAll, fieldClass, hasError, hasErrors }
}
