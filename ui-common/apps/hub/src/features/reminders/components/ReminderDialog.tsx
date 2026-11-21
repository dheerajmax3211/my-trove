import { Button, Dialog, DialogClose, Field, Input, Select, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { ScopeSelect, SCOPE_PERSONAL } from '../../../components/ScopeSelect'
import { errorMessage } from '../../../lib/errors'
import { toLocalInputValue } from '../../../lib/format'
import { useRuntime } from '../../../runtime/context'
import type { Household } from '../../households/types'
import { useCreateReminder, useUpdateReminder } from '../hooks'
import {
  INTERVAL_MAX,
  validateReminder,
  type ReminderForm,
  type ReminderFormErrors,
} from '../validate'
import type { Reminder } from '../types'

interface ReminderDialogProps {
  /** `null` closes the dialog; a reminder edits it; `'new'` creates one. */
  target: Reminder | 'new' | null
  households: readonly Household[]
  onClose: () => void
}

const HOUR_MS = 3_600_000

function initialForm(target: Reminder | 'new', now: number): ReminderForm {
  if (target === 'new')
    return {
      title: '',
      due: toLocalInputValue(new Date(now + 24 * HOUR_MS).toISOString()),
      repeat: 'NONE',
      interval: '1',
    }
  return {
    title: target.title,
    due: toLocalInputValue(target.dueAt),
    repeat: target.recurrence?.unit ?? 'NONE',
    interval: String(target.recurrence?.interval ?? 1),
  }
}

function ReminderFormBody({
  target,
  households,
  onClose,
}: Omit<ReminderDialogProps, 'target'> & { target: Reminder | 'new' }) {
  const { toast } = useToast()
  const { now } = useRuntime()
  const editing = target !== 'new'
  const [form, setForm] = useState(() => initialForm(target, now()))
  const [scope, setScope] = useState(SCOPE_PERSONAL)
  const [errors, setErrors] = useState<ReminderFormErrors>({})
  const create = useCreateReminder()
  const update = useUpdateReminder()
  const mutation = editing ? update : create
  const set = <K extends keyof ReminderForm>(key: K, value: ReminderForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const { errors: found, input } = validateReminder(form)
    setErrors(found)
    if (!input) return
    const done = (title: string) => {
      toast({ title, description: input.title, variant: 'success' })
      onClose()
    }
    if (editing)
      update.mutate({ ...input, id: target.id }, { onSuccess: () => done('Reminder updated') })
    else
      create.mutate(
        { ...input, ...(scope === SCOPE_PERSONAL ? {} : { householdId: scope }) },
        { onSuccess: () => done('Reminder created') },
      )
  }

  return (
    <form id="reminder-form" className="hub-stack-sm" onSubmit={submit} noValidate>
      <Field label="Title" required error={errors.title}>
        <Input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          autoComplete="off"
        />
      </Field>
      <Field label="Due" required error={errors.due}>
        <Input
          type="datetime-local"
          value={form.due}
          onChange={(e) => set('due', e.target.value)}
        />
      </Field>
      <Field label="Repeats" description="Repeats are calculated in UTC from the first due time.">
        <Select
          value={form.repeat}
          onChange={(e) => set('repeat', e.target.value as ReminderForm['repeat'])}
        >
          <option value="NONE">Does not repeat</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
        </Select>
      </Field>
      {form.repeat !== 'NONE' ? (
        <Field
          label={`Every how many ${{ DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months' }[form.repeat]}?`}
          error={errors.interval}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={INTERVAL_MAX}
            value={form.interval}
            onChange={(e) => set('interval', e.target.value)}
          />
        </Field>
      ) : null}
      {editing ? null : (
        <ScopeSelect
          label="Who is it for?"
          value={scope}
          onChange={setScope}
          households={households}
          description="Household reminders notify every member."
        />
      )}
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
    </form>
  )
}

export function ReminderDialog({ target, households, onClose }: ReminderDialogProps) {
  const editing = target !== null && target !== 'new'
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={editing ? 'Edit reminder' : 'New reminder'}
      description={
        editing
          ? 'Changing the due time restarts the schedule from the new time.'
          : 'Choose when it is due and whether it repeats.'
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="reminder-form">
            {editing ? 'Save changes' : 'Create reminder'}
          </Button>
        </>
      }
    >
      {target ? (
        <ReminderFormBody target={target} households={households} onClose={onClose} />
      ) : null}
    </Dialog>
  )
}
