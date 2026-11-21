import { Button, Dialog, DialogClose } from '@platform/ui'
import type { ReactNode } from 'react'

export interface ConfirmDialogProps {
  title: string
  description: ReactNode
  confirmLabel: string
  variant?: 'primary' | 'danger'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

/** Modal confirmation for anything hard to undo. Cancel is always available; Escape cancels. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
      title={title}
      description={description}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button variant={variant} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}
