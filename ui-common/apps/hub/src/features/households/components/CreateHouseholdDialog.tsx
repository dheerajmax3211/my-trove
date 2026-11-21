import { Button, Dialog, DialogClose, Field, Input, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useModuleNavigate } from '@platform/workspace-kit'
import { errorMessage } from '../../../lib/errors'
import { useCreateHousehold } from '../hooks'

const NAME_MAX = 200

export function CreateHouseholdDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const navigate = useModuleNavigate()
  const [name, setName] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const create = useCreateHousehold()

  const close = (next: boolean) => {
    if (!next) {
      setName('')
      setFieldError(undefined)
      create.reset()
    }
    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setFieldError('Give the household a name.')
    if (name.length > NAME_MAX) return setFieldError(`Keep the name under ${NAME_MAX} characters.`)
    setFieldError(undefined)
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (household) => {
          toast({ title: 'Household created', description: household.name, variant: 'success' })
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
      title="Create a household"
      description="A household is a shared space for reminders and files. You become its owner."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="create-household-form" loading={create.isPending}>
            Create household
          </Button>
        </>
      }
    >
      <form id="create-household-form" className="hub-stack-sm" onSubmit={submit} noValidate>
        <Field label="Household name" required error={fieldError}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        {create.error ? <p role="alert">{errorMessage(create.error)}</p> : null}
      </form>
    </Dialog>
  )
}
