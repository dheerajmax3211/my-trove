import { Button, Dialog, DialogClose, Field, Input, Select, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useGuardedMutation } from '../../../api/hooks'
import { ROLES, type AddMemberRequest, type MemberView, type Role } from '../../../api/types'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { ROLE_LABEL } from '../../../components/RoleBadge'
import { describeError } from '../../../lib/errors'
import { useHousehold } from '../../household/hooks/useHousehold'

export function AddMemberDialog({ onClose }: { onClose: () => void }) {
  const h = useHousehold()
  const { toast } = useToast()
  const [uid, setUid] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('MEMBER')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { mutation, submit } = useGuardedMutation<MemberView, AddMemberRequest>({
    run: (api, vars) => api.addMember(h.household.id, vars),
    householdId: h.household.id,
    onSuccess: (m) => {
      toast({
        title: 'Member added',
        description: `${m.displayName ?? m.uid} now has a pot.`,
        variant: 'success',
      })
      onClose()
    },
  })
  const server = mutation.error ? describeError(mutation.error) : null

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (uid.trim() === '') next.uid = 'Enter their member ID.'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    submit({ uid: uid.trim(), role, displayName: name.trim() === '' ? null : name.trim() })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Add a member"
      description="They get their own pot. They need an account first: ask them for their member ID (shown on this page when they sign in)."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="add-member" loading={mutation.isPending}>
            Add member
          </Button>
        </>
      }
    >
      <form id="add-member" className="ft-form" onSubmit={onSubmit} noValidate>
        <Field
          label="Member ID"
          required
          error={errors.uid ?? (server?.field === 'uid' ? server.message : undefined)}
        >
          <Input value={uid} onChange={(e) => setUid(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Name" description="Shown instead of the ID.">
          <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Role" required>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        {server && server.field !== 'uid' ? <ErrorNotice error={mutation.error} /> : null}
      </form>
    </Dialog>
  )
}
