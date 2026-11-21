import { useState, type FormEvent } from 'react'
import { useIdempotentMutation } from '../../../api/hooks'
import type { EntryView, TransferRequest } from '../../../api/types'
import { AmountField } from '../../../components/AmountField'
import { describeError } from '../../../lib/errors'
import { formatMinor, parseAmount } from '../../../lib/money'
import { useHousehold } from '../../household/hooks/useHousehold'
import { AccountSelect } from './AccountSelect'
import { DescriptionField, SubmitRow, SuccessPanel, validateDescription } from './FormParts'

/** Move money between two of the household's own accounts (for example the pool into a member's pot). */
export function TransferForm() {
  const h = useHousehold()
  const [fromId, setFromId] = useState(h.transferSources[0]?.id ?? '')
  const toOptions = h.assets.filter((a) => a.id !== fromId)
  const [toIdRaw, setToId] = useState('')
  const toId = toOptions.some((a) => a.id === toIdRaw) ? toIdRaw : (toOptions[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { mutation, submit } = useIdempotentMutation<EntryView, TransferRequest>({
    run: (api, vars, key) => api.transfer(h.household.id, vars, key),
    householdId: h.household.id,
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    const parsed = parseAmount(amount, h.currency)
    if (!parsed.ok) next.amount = parsed.message
    const descriptionError = validateDescription(description)
    if (descriptionError) next.description = descriptionError
    if (fromId === '' || toId === '') next.toAccountId = 'Choose two different accounts.'
    setErrors(next)
    if (!parsed.ok || Object.keys(next).length > 0) return
    submit({
      fromAccountId: fromId,
      toAccountId: toId,
      amountMinor: parsed.minor,
      description: description.trim(),
    })
  }

  const reset = () => {
    mutation.reset()
    setAmount('')
    setDescription('')
    setErrors({})
  }

  if (mutation.isSuccess) {
    const moved = mutation.data.postings.find((p) => p.amountMinor > 0)?.amountMinor ?? 0
    return (
      <SuccessPanel title="Transfer recorded" onAgain={reset} againLabel="Record another transfer">
        <p>
          {formatMinor(moved, h.currency)} moved from {h.accountName(fromId)} to{' '}
          {h.accountName(toId)}.
        </p>
      </SuccessPanel>
    )
  }

  const serverError = mutation.error
    ? describeError(mutation.error, { currency: h.currency })
    : null
  if (h.transferSources.length === 0) {
    return <p className="ft-muted">There is no account you can move money out of.</p>
  }
  return (
    <form className="ft-form" onSubmit={onSubmit} noValidate aria-label="Transfer">
      <AccountSelect
        label="From"
        value={fromId}
        onChange={setFromId}
        accounts={h.transferSources}
        showBalance
      />
      <AccountSelect
        label="To"
        value={toId}
        onChange={setToId}
        accounts={toOptions}
        showBalance
        error={
          errors.toAccountId ??
          (serverError?.field === 'toAccountId' ? serverError.message : undefined)
        }
      />
      <AmountField
        value={amount}
        onChange={setAmount}
        currency={h.currency}
        error={errors.amount ?? (serverError?.field === 'amount' ? serverError.message : undefined)}
      />
      <DescriptionField value={description} onChange={setDescription} error={errors.description} />
      <SubmitRow
        label="Record transfer"
        loading={mutation.isPending}
        error={serverError?.field ? null : mutation.error}
        currency={h.currency}
      />
    </form>
  )
}
