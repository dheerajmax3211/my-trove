import { Button, Dialog, DialogClose, Field, Input, Select, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useGuardedMutation } from '../../../api/hooks'
import type { CreateScheduleRequest, Frequency, ScheduleView } from '../../../api/types'
import { AmountField } from '../../../components/AmountField'
import { ErrorNotice } from '../../../components/ErrorNotice'
import { useNow } from '../../../clock'
import { utcToday } from '../../../lib/dates'
import { describeError } from '../../../lib/errors'
import { parseAmount } from '../../../lib/money'
import { useHousehold } from '../../household/hooks/useHousehold'

export function CreateScheduleDialog({ onClose }: { onClose: () => void }) {
  const h = useHousehold()
  const { toast } = useToast()
  const now = useNow()
  const today = utcToday(now)
  const kidPots = h.pots.filter(
    (p) => h.household.members.find((m) => m.uid === p.ownerUid)?.role === 'KID',
  )
  const targets = kidPots.length > 0 ? kidPots : h.pots
  const [toId, setToId] = useState(targets[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('WEEKLY')
  const [startDate, setStartDate] = useState(today)
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { mutation, submit } = useGuardedMutation<ScheduleView, CreateScheduleRequest>({
    run: (api, vars) => api.createSchedule(h.household.id, vars),
    householdId: h.household.id,
    onSuccess: () => {
      toast({ title: 'Allowance scheduled', variant: 'success' })
      onClose()
    },
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    const parsed = parseAmount(amount, h.currency)
    if (!parsed.ok) next.amount = parsed.message
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) next.startDate = 'Pick a start date.'
    else if (startDate < today)
      next.startDate = 'The start date cannot be in the past: missed periods are never paid back.'
    if (description.trim() === '') next.description = 'Add a short description.'
    if (toId === '') next.to = 'Choose who gets the allowance.'
    setErrors(next)
    if (!parsed.ok || Object.keys(next).length > 0) return
    submit({
      fromAccountId: null,
      toAccountId: toId,
      amountMinor: parsed.minor,
      frequency,
      startDate,
      description: description.trim(),
    })
  }

  const server = mutation.error ? describeError(mutation.error, { currency: h.currency }) : null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="New allowance"
      description="Paid from the shared pool into their pot. If a period is missed, only the latest one is paid."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="create-allowance" loading={mutation.isPending}>
            Create allowance
          </Button>
        </>
      }
    >
      <form id="create-allowance" className="ft-form" onSubmit={onSubmit} noValidate>
        <Field label="Who gets it" required error={errors.to}>
          <Select value={toId} onChange={(e) => setToId(e.target.value)}>
            {targets.map((p) => (
              <option key={p.id} value={p.id}>
                {h.memberName(p.ownerUid ?? '')}
              </option>
            ))}
          </Select>
        </Field>
        <AmountField
          value={amount}
          onChange={setAmount}
          currency={h.currency}
          error={errors.amount ?? (server?.field === 'amount' ? server.message : undefined)}
        />
        <Field label="How often" required>
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            <option value="WEEKLY">Every week</option>
            <option value="MONTHLY">Every month</option>
          </Select>
        </Field>
        <Field
          label="First payment on"
          required
          error={errors.startDate ?? (server?.field === 'startDate' ? server.message : undefined)}
          description="Dates are in UTC."
        >
          <Input
            type="date"
            value={startDate}
            min={today}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Description" required error={errors.description}>
          <Input
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {server && !server.field ? <ErrorNotice error={mutation.error} /> : null}
      </form>
    </Dialog>
  )
}
