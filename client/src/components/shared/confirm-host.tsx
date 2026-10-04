import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { settleConfirm, useConfirmStore } from '@/lib/confirm'

// Renders the dialog behind confirmAsync() (lib/confirm.ts). Mounted once in main.tsx.
export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current)
  return (
    <ConfirmDialog
      open={!!current}
      onOpenChange={(open) => { if (!open) settleConfirm(false) }}
      title={current?.title ?? ''}
      description={current?.description ?? ''}
      confirmLabel={current?.confirmLabel}
      cancelLabel={current?.cancelLabel}
      variant={current?.destructive ? 'destructive' : 'default'}
      onConfirm={() => settleConfirm(true)}
    />
  )
}
