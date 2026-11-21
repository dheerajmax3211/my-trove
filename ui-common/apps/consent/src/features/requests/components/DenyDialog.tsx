import { Field, Textarea, useToast } from '@platform/ui'
import { useState } from 'react'
import type { AccessRequest } from '../../../shared/api/types'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { fieldErrors } from '../../../shared/lib/errors'
import { useDenyRequest } from '../hooks/useRequests'

const MAX_NOTE = 500

export interface DenyDialogProps {
  request: AccessRequest | null
  onOpenChange: (open: boolean) => void
}

function NoteField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string | undefined
}) {
  const tooLong = value.length > MAX_NOTE
  return (
    <Field
      label="Note (optional)"
      description="Kept in your records. The app is not told why."
      error={tooLong ? `Use at most ${MAX_NOTE} characters.` : error}
    >
      <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function DenyDialog({ request, onOpenChange }: DenyDialogProps) {
  const { toast } = useToast()
  const deny = useDenyRequest()
  const [note, setNote] = useState('')

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      deny.reset()
      setNote('')
    }
    onOpenChange(open)
  }

  const confirm = () => {
    if (!request || note.length > MAX_NOTE) return
    const trimmed = note.trim()
    deny.mutate(
      { id: request.id, body: trimmed ? { note: trimmed } : {} },
      {
        onSuccess: () => {
          toast({
            title: 'Request denied',
            description: `${request.clientName} gets no access.`,
            variant: 'success',
          })
          handleOpenChange(false)
        },
      },
    )
  }

  return (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={handleOpenChange}
      title={request ? `Deny ${request.clientName}?` : 'Deny request'}
      description={
        request
          ? `${request.clientName} will not get access to ${request.scopes.join(', ')}. It would have to ask again.`
          : ''
      }
      confirmLabel="Deny request"
      destructive
      pending={deny.isPending}
      error={deny.error}
      onConfirm={confirm}
    >
      <NoteField value={note} onChange={setNote} error={fieldErrors(deny.error).note} />
    </ConfirmDialog>
  )
}
