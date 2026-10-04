import { create } from 'zustand'

// Promise-based confirmation using the app's own ConfirmDialog — the replacement for the browser's native
// confirm box (grey, unstyled, blocked by some in-app browsers).
//   if (!(await confirmAsync({ title: 'Supprimer la photo ?', destructive: true }))) return
// <ConfirmHost /> (components/shared/confirm-host.tsx) is mounted once at the app root and renders the dialog;
// a second call while one is open cancels the first.
export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
}

export const useConfirmStore = create<ConfirmState>(() => ({ current: null }))

export function confirmAsync(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useConfirmStore.getState().current?.resolve(false)
    useConfirmStore.setState({ current: { ...options, resolve } })
  })
}

// Closes the open confirmation with the user's answer.
export function settleConfirm(ok: boolean) {
  const current = useConfirmStore.getState().current
  if (!current) return
  useConfirmStore.setState({ current: null })
  current.resolve(ok)
}
