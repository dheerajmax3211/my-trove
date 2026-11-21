import { Button, Dialog, DialogClose } from '@platform/ui'
import type { ReactNode } from 'react'
import type { ApiError } from '@platform/api-client'
import { describeError } from '../lib/errors'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Plain statement of what will happen. */
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  pending?: boolean
  error?: ApiError | null
  onConfirm: () => void
  children?: ReactNode
}

/** Confirmation for actions that cannot be undone. Closing is the parent's job, after success. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
  error,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">{cancelLabel}</Button>
          </DialogClose>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error ? (
        <p role="alert" className="form-error">
          {describeError(error).message}
        </p>
      ) : null}
    </Dialog>
  )
}
