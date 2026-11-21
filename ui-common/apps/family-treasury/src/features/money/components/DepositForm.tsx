import { useState, type FormEvent } from 'react'
import { useIdempotentMutation } from '../../../api/hooks'
import type { DepositRequest, EntryView } from '../../../api/types'
import { AmountField } from '../../../components/AmountField'
import { MoneyText } from '../../../components/MoneyText'
import { describeError } from '../../../lib/errors'
import { parseAmount } from '../../../lib/money'
import { useHousehold } from '../../household/hooks/useHousehold'
import { AccountSelect } from './AccountSelect'
import { DescriptionField, SubmitRow, SuccessPanel, validateDescription } from './FormParts'

/** Record money that came in. The idempotency key lives as long as this form instance does. */
export function DepositForm() {
  const h = useHousehold()
  const [toId, setToId] = useState(h.pool?.id ?? h.assets[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { mutation, submit } = useIdempotentMutation<EntryView, DepositRequest>({
    run: (api, vars, key) => api.deposit(h.household.id, vars, key),
    householdId: h.household.id,
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    const parsed = parseAmount(amount, h.currency)
    if (!parsed.ok) next.amount = parsed.message
    const descriptionError = validateDescription(description)
    if (descriptionError) next.description = descriptionError
    setErrors(next)
    if (!parsed.ok || Object.keys(next).length > 0) return
    const income = h.incomeAccounts.find((a) => a.code === 'INCOME:DEPOSITS') ?? h.incomeAccounts[0]
    submit({
      toAccountId: toId,
      incomeAccountId: income?.id ?? null,
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
    return (
      <SuccessPanel title="Deposit recorded" onAgain={reset} againLabel="Record another deposit">
        <p>
          <MoneyText minor={mutation.data.postings[0]?.amountMinor ?? 0} currency={h.currency} />{' '}
          added to {h.accountName(toId)}. This only records money you already hold.
        </p>
      </SuccessPanel>
    )
  }

  const serverField = mutation.error
    ? describeError(mutation.error, { currency: h.currency })
    : null
  return (
    <form className="ft-form" onSubmit={onSubmit} noValidate aria-label="Deposit">
      <AccountSelect label="Into" value={toId} onChange={setToId} accounts={h.assets} showBalance />
      <AmountField
        value={amount}
        onChange={setAmount}
        currency={h.currency}
        error={errors.amount ?? (serverField?.field === 'amount' ? serverField.message : undefined)}
      />
      <DescriptionField value={description} onChange={setDescription} error={errors.description} />
      <SubmitRow
        label="Record deposit"
        loading={mutation.isPending}
        error={serverField?.field === 'amount' ? null : mutation.error}
        currency={h.currency}
      />
    </form>
  )
}
