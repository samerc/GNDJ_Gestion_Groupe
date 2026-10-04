import { lazy, Suspense, useState } from 'react'
import { useConfirmStore } from '@/lib/confirm'

// Mounted once in main.tsx. Loads the confirm dialog only the first time confirmAsync() is called, so the
// dialog code stays out of the first-load bundle; it then stays mounted (keeps the close animation).
const ConfirmHost = lazy(() => import('@/components/shared/confirm-host').then((m) => ({ default: m.ConfirmHost })))

export function ConfirmHostGate() {
  const open = useConfirmStore((s) => s.current !== null)
  const [used, setUsed] = useState(false)
  if (open && !used) setUsed(true)
  return used ? <Suspense fallback={null}><ConfirmHost /></Suspense> : null
}
