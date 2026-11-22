import { Button, Callout, Dialog, DialogClose } from '@platform/ui'
import type { ReactNode } from 'react'

export interface ConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** What happens, and whether it can be undone. Shown before the button. */
  description: ReactNode
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
  /** Set when the action cannot be undone, so the button reads as a danger. */
  danger?: boolean
  error?: string
}

/** A question before anything is removed or revoked. Cancel is the first, quiet choice. */
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy = false,
  danger = false,
  error,
}: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={typeof description === 'string' ? description : undefined}
      dismissible={!busy}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {typeof description === 'string' ? null : <div>{description}</div>}
      {error ? (
        <Callout variant="danger" title="That did not work">
          {error}
        </Callout>
      ) : null}
    </Dialog>
  )
}
