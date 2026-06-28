import { useState, useEffect } from 'react'

// Returns a copy of `value` that only updates after `delay` ms of no change — used to throttle
// search-input-driven queries.
export function useDebounce<T>(value: T, delay: number = 400): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
