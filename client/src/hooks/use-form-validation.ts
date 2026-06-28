import { useState, useCallback } from 'react'

// Lightweight client-side required-field tracker for forms: callers pass a {field: isInvalid} map to
// validate(), then use fieldClass()/hasError() to highlight bad fields with the destructive ring.
export function useFormValidation() {
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

  // Mark each field invalid per `rules`; returns true when nothing is invalid.
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

  // Error-highlight classes for a field (empty string when valid) — spread onto the input's className.
  const fieldClass = useCallback((field: string) =>
    fieldErrors.has(field) ? 'border-destructive ring-destructive' : ''
  , [fieldErrors])

  const hasError = useCallback((field: string) => fieldErrors.has(field), [fieldErrors])

  const hasErrors = fieldErrors.size > 0

  return { fieldErrors, validate, clearField, clearAll, fieldClass, hasError, hasErrors }
}
