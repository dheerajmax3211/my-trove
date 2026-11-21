import { Field, Select } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useIdempotentMutation } from '../../../api/hooks'
import type { SpendRequest, SpendResult } from '../../../api/types'
import { AmountField } from '../../../components/AmountField'
import { MoneyText } from '../../../components/MoneyText'
import { describeError } from '../../../lib/errors'
import { formatMinor, parseAmount } from '../../../lib/money'
import { useHousehold } from '../../household/hooks/useHousehold'
import { AccountSelect } from './AccountSelect'
import { DescriptionField, SubmitRow, SuccessPanel, validateDescription } from './FormParts'

/** Record a spend. Above the household limit it becomes an approval request and no balance changes yet. */
export function SpendForm() {
  const h = useHousehold()
  const defaultFrom = h.isKid ? h.myPot : (h.pool ?? h.spendSources[0])
  const [fromId, setFromId] = useState(defaultFrom?.id ?? h.spendSources[0]?.id ?? '')
  const defaultCategory =
    h.expenseCategories.find((a) => a.code === 'EXPENSE:GENERAL') ?? h.expenseCategories[0]
  const [categoryId, setCategoryId] = useState(defaultCategory?.id ?? '')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { mutation, submit } = useIdempotentMutation<SpendResult, SpendRequest>({
    run: (api, vars, key) => api.spend(h.household.id, vars, key),
    householdId: h.household.id,
  })

  const parsed = parseAmount(amount, h.currency)
  const limit = h.household.approvalThresholdMinor
  const needsApproval = parsed.ok && limit !== null && parsed.minor > limit

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!parsed.ok) next.amount = parsed.message
    const descriptionError = validateDescription(description)
    if (descriptionError) next.description = descriptionError
    if (fromId === '') next.from = 'Choose where the money comes from.'
    setErrors(next)
    if (!parsed.ok || Object.keys(next).length > 0) return
    submit({
      fromAccountId: fromId,
      categoryAccountId: categoryId === '' ? null : categoryId,
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
    const result = mutation.data
    if (result.status === 'PENDING_APPROVAL' && result.approval) {
      return (
        <SuccessPanel title="Sent for approval" onAgain={reset} againLabel="Record another spend">
          <p>
            <MoneyText minor={result.approval.amountMinor} currency={h.currency} /> for &ldquo;
            {result.approval.description}&rdquo; is above the approval limit. No balance has changed
            yet. An owner or approver (not you) needs to approve it, and it expires{' '}
            {h.household.approvalExpiryHours} hours after you asked.
          </p>
          <p>
            <Link to={`/h/${h.household.id}/approvals`}>Track it in Approvals</Link>
          </p>
        </SuccessPanel>
      )
    }
    return (
      <SuccessPanel title="Spend recorded" onAgain={reset} againLabel="Record another spend">
        <p>
          <MoneyText
            minor={result.entry?.postings.find((p) => p.amountMinor > 0)?.amountMinor ?? 0}
            currency={h.currency}
          />{' '}
          taken from {h.accountName(fromId)}.
        </p>
      </SuccessPanel>
    )
  }

  const serverError = mutation.error
    ? describeError(mutation.error, { currency: h.currency })
    : null
  return (
    <form className="ft-form" onSubmit={onSubmit} noValidate aria-label="Spend">
      {h.isKid ? null : (
        <AccountSelect
          label="Paid from"
          value={fromId}
          onChange={setFromId}
          accounts={h.spendSources}
          showBalance
          error={errors.from}
        />
      )}
      {h.isKid && h.myPot ? (
        <p className="ft-muted">
          From your pot: {formatMinor(h.myPot.balanceMinor, h.currency)} available.
        </p>
      ) : null}
      {h.expenseCategories.length > 1 ? (
        <Field label="Category" required>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {h.expenseCategories.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <AmountField
        value={amount}
        onChange={setAmount}
        currency={h.currency}
        error={errors.amount ?? (serverError?.field === 'amount' ? serverError.message : undefined)}
      />
      {needsApproval && limit !== null ? (
        <div role="status" className="ft-notice ft-notice-info">
          This is above the approval limit of {formatMinor(limit, h.currency)}. It will be sent for
          approval and will not change any balance until someone else approves it.
        </div>
      ) : null}
      <DescriptionField value={description} onChange={setDescription} error={errors.description} />
      <SubmitRow
        label={needsApproval ? 'Send for approval' : 'Record spend'}
        loading={mutation.isPending}
        error={serverError?.field === 'amount' ? null : mutation.error}
        currency={h.currency}
      />
    </form>
  )
}
