import { Button, DialogClose, Dialog, Field, Input } from '@platform/ui'
import { useState, type ReactNode } from 'react'
import { errorMessage } from '../lib/errors'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  /** Label of the button that backs out. Default "Cancel". */
  cancelLabel?: string
  onConfirm: () => void
  pending?: boolean
  /** Failure from the last attempt; shown inside the dialog. */
  error?: unknown
  /** Replaces the generic message for `error` (e.g. to explain a known rule). */
  errorText?: string
  /** Extra safety for the most destructive actions: the user must type this to enable the button. */
  confirmPhrase?: string
  variant?: 'danger' | 'primary'
  children?: ReactNode
}

/** A destructive or irreversible action behind an explicit confirmation. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  pending = false,
  error,
  errorText,
  confirmPhrase,
  variant = 'danger',
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const confirmed = !confirmPhrase || typed === confirmPhrase
  const change = (next: boolean) => {
    setTyped('')
    onOpenChange(next)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={change}
      title={title}
      description={description}
      dismissible={!pending}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button variant={variant} loading={pending} disabled={!confirmed} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="hub-stack-sm">
        {children}
        {confirmPhrase ? (
          <Field label={`Type "${confirmPhrase}" to confirm`}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        ) : null}
        {error ? <p role="alert">{errorText ?? errorMessage(error)}</p> : null}
      </div>
    </Dialog>
  )
}
