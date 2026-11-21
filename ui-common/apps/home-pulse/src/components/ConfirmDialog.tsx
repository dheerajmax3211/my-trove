import { Button, Dialog, DialogClose } from '@platform/ui'
import type { ReactNode } from 'react'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
  /** A message shown when the last attempt failed. */
  error?: string | null
}

/** Confirmation for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy = false,
  error,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? <p role="alert">{error}</p> : null}
    </Dialog>
  )
}
