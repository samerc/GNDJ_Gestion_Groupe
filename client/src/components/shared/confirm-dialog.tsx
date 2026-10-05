import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { type ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  loading?: boolean
  onConfirm: () => void
  /** Optional extra content rendered between the description and the buttons. */
  children?: ReactNode
  /** The action is impossible (e.g. a delete the server would refuse): show only a "Fermer" button. */
  hideConfirm?: boolean
  /** Keep the confirm button visible but disabled (e.g. a preview says the action is blocked right now). */
  confirmDisabled?: boolean
}

// Reusable confirm/cancel modal (used for deletes, archives, etc.). `variant="destructive"` reddens the
// confirm button; `children` slots extra content (e.g. an affected-members list) between text and buttons.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'default',
  loading = false,
  onConfirm,
  children,
  hideConfirm = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {hideConfirm ? 'Fermer' : cancelLabel}
          </Button>
          {!hideConfirm && (
            <Button variant={variant === 'destructive' ? 'destructive' : 'default'} onClick={onConfirm} disabled={loading || confirmDisabled}>
              {loading ? 'Patientez…' : confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
