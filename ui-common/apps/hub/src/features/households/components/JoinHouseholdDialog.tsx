import { Button, Dialog, DialogClose, Field, Input, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '../../../lib/errors'
import { useAcceptInvite } from '../hooks'

export function JoinHouseholdDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const accept = useAcceptInvite()

  const close = (next: boolean) => {
    if (!next) {
      setCode('')
      setFieldError(undefined)
      accept.reset()
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!code.trim()) return setFieldError('Paste the invite code you were given.')
    setFieldError(undefined)
    accept.mutate(
      { code: code.trim() },
      {
        onSuccess: (household) => {
          toast({
            title: `You joined ${household.name}`,
            description: `Your role: ${household.role === 'OWNER' ? 'owner' : 'member'}.`,
            variant: 'success',
          })
          close(false)
          void navigate(`/households/${household.id}`)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Join with an invite code"
      description="Codes work once and expire. Ask a household owner for a new one if yours does not work."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="join-household-form" loading={accept.isPending}>
            Join household
          </Button>
        </>
      }
    >
      <form id="join-household-form" className="hub-stack-sm" onSubmit={submit} noValidate>
        <Field label="Invite code" required error={fieldError}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        {accept.error ? <p role="alert">{errorMessage(accept.error)}</p> : null}
      </form>
    </Dialog>
  )
}
