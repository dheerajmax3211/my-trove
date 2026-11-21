import { Button, Dialog, DialogClose, Field, Input, Textarea, useToast } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { describeError } from '../../../lib/errors'
import { useCancelItem, useResolveItem, useSnoozeItem } from '../hooks/useItems'
import type { Item } from '../api/types'

interface DialogProps {
  item: Item
  open: boolean
  onOpenChange: (open: boolean) => void
}

const OUTCOME_MAX = 1000
const SNOOZE_PRESETS = [3, 7, 14, 30]

export function ResolveDialog({ item, open, onOpenChange }: DialogProps) {
  const { toast } = useToast()
  const [outcome, setOutcome] = useState('')
  const resolve = useResolveItem(item.id)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = outcome.trim()
    resolve.mutate(text ? { outcome: text } : {}, {
      onSuccess: () => {
        toast({
          title: 'Marked as resolved',
          description: 'Follow-ups have stopped.',
          variant: 'success',
        })
        onOpenChange(false)
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resolve.reset()
        onOpenChange(next)
      }}
      title="Mark as resolved"
      description={`Got what you were waiting for from ${item.counterparty}? Follow-ups will stop straight away.`}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Not yet</Button>
          </DialogClose>
          <Button type="submit" form="resolve-form" loading={resolve.isPending}>
            Mark as resolved
          </Button>
        </>
      }
    >
      <form id="resolve-form" className="wo-stack" onSubmit={submit} noValidate>
        <Field
          label="How did it end?"
          description={`Optional, up to ${OUTCOME_MAX} characters. For example: refunded in full to my card.`}
        >
          <Textarea
            rows={3}
            maxLength={OUTCOME_MAX}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </Field>
        {resolve.isError ? (
          <p className="wo-alert" role="alert">
            {describeError(resolve.error)}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}

export function SnoozeDialog({ item, open, onOpenChange }: DialogProps) {
  const { toast } = useToast()
  const [days, setDays] = useState('7')
  const [error, setError] = useState<string | undefined>()
  const snooze = useSnoozeItem(item.id)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = Number(days)
    if (days.trim() === '' || !Number.isInteger(value) || value < 1 || value > 90) {
      setError('Enter a whole number of days from 1 to 90.')
      return
    }
    setError(undefined)
    snooze.mutate(
      { days: value },
      {
        onSuccess: () => {
          toast({
            title: `Snoozed for ${value} ${value === 1 ? 'day' : 'days'}`,
            description: 'Every remaining follow-up moved later.',
            variant: 'success',
          })
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          snooze.reset()
          setError(undefined)
        }
        onOpenChange(next)
      }}
      title="Snooze follow-ups"
      description="Push every remaining follow-up later. Use it when they asked for more time."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="snooze-form" loading={snooze.isPending}>
            Snooze
          </Button>
        </>
      }
    >
      <form id="snooze-form" className="wo-stack" onSubmit={submit} noValidate>
        <Field label="Snooze for how many days?" required error={error}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
        <div className="wo-row-actions" role="group" aria-label="Quick choices">
          {SNOOZE_PRESETS.map((preset) => (
            <Button key={preset} size="sm" variant="ghost" onClick={() => setDays(String(preset))}>
              {preset} days
            </Button>
          ))}
        </div>
        {snooze.isError ? (
          <p className="wo-alert" role="alert">
            {describeError(snooze.error)}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}

export function CancelDialog({ item, open, onOpenChange }: DialogProps) {
  const { toast } = useToast()
  const cancel = useCancelItem(item.id)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel.reset()
        onOpenChange(next)
      }}
      title="Stop tracking this item?"
      description={`"${item.title}" will be marked as cancelled and all follow-ups will stop. This cannot be undone.`}
      size="sm"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Keep tracking</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={cancel.isPending}
            onClick={() =>
              cancel.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: 'Tracking cancelled', variant: 'neutral' })
                  onOpenChange(false)
                },
              })
            }
          >
            Yes, stop tracking
          </Button>
        </>
      }
    >
      {cancel.isError ? (
        <p className="wo-alert" role="alert">
          {describeError(cancel.error)}
        </p>
      ) : null}
    </Dialog>
  )
}
