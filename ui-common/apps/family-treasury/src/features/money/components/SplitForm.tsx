import { Checkbox, Field, Input, Select } from '@platform/ui'
import { useState, type FormEvent } from 'react'
import { useIdempotentMutation } from '../../../api/hooks'
import type { SplitRequest, SplitResult } from '../../../api/types'
import { AmountField } from '../../../components/AmountField'
import { MoneyText } from '../../../components/MoneyText'
import { describeError } from '../../../lib/errors'
import { formatMinor, parseAmount, previewSplit, sumMinor } from '../../../lib/money'
import { useHousehold } from '../../household/hooks/useHousehold'
import { DescriptionField, SubmitRow, SuccessPanel, validateDescription } from './FormParts'

interface ShareState {
  included: boolean
  weight: string
}

const parseWeight = (text: string): number | null => {
  const n = Number(text)
  return /^\d+$/.test(text.trim()) && n >= 1 && n <= 1_000_000 ? n : null
}

/**
 * Split one expense across member pots. The preview below the form is computed with the same largest-remainder
 * rounding the server uses, so what you see is exactly what will be posted.
 */
export function SplitForm() {
  const h = useHousehold()
  const pots = h.pots.filter((p) => h.spendSources.some((s) => s.id === p.id))
  const [categoryId, setCategoryId] = useState(
    (h.expenseCategories.find((a) => a.code === 'EXPENSE:GENERAL') ?? h.expenseCategories[0])?.id ??
      '',
  )
  const [total, setTotal] = useState('')
  const [description, setDescription] = useState('')
  const [shares, setShares] = useState<Record<string, ShareState>>(() =>
    Object.fromEntries(pots.map((p) => [p.id, { included: true, weight: '1' }])),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { mutation, submit } = useIdempotentMutation<SplitResult, SplitRequest>({
    run: (api, vars, key) => api.split(h.household.id, vars, key),
    householdId: h.household.id,
  })

  const parsedTotal = parseAmount(total, h.currency)
  const chosen = pots.flatMap((p) => {
    const s = shares[p.id]
    if (!s?.included) return []
    return [{ pot: p, weight: parseWeight(s.weight) }]
  })
  const weightsValid = chosen.length > 0 && chosen.every((c) => c.weight !== null)

  const preview =
    parsedTotal.ok && weightsValid
      ? previewSplit(
          parsedTotal.minor,
          chosen.map((c) => ({ id: c.pot.id, weight: c.weight ?? 1 })),
        )
      : null

  const update = (id: string, patch: Partial<ShareState>) =>
    setShares((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { included: true, weight: '1' }), ...patch },
    }))

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!parsedTotal.ok) next.total = parsedTotal.message
    const descriptionError = validateDescription(description)
    if (descriptionError) next.description = descriptionError
    if (chosen.length === 0) next.shares = 'Choose at least one pot to split between.'
    else if (!weightsValid) next.shares = 'Each weight must be a whole number from 1 to 1,000,000.'
    setErrors(next)
    if (!parsedTotal.ok || !preview || Object.keys(next).length > 0) return
    submit({
      expenseAccountId: categoryId,
      totalMinor: parsedTotal.minor,
      description: description.trim(),
      shares: chosen.map((c) => ({ accountId: c.pot.id, weight: c.weight ?? 1 })),
    })
  }

  const reset = () => {
    mutation.reset()
    setTotal('')
    setDescription('')
    setErrors({})
  }

  if (mutation.isSuccess) {
    return (
      <SuccessPanel title="Split recorded" onAgain={reset} againLabel="Record another split">
        <table className="ft-table" aria-label="Recorded split">
          <thead>
            <tr>
              <th scope="col">Pot</th>
              <th scope="col" className="ft-num">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {mutation.data.allocations.map((a) => (
              <tr key={a.accountId}>
                <td>{h.accountName(a.accountId)}</td>
                <td className="ft-num">
                  <MoneyText minor={a.shareMinor} currency={h.currency} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SuccessPanel>
    )
  }

  if (pots.length === 0)
    return <p className="ft-muted">There are no pots you can split an expense across.</p>

  const allocated = preview ? sumMinor(preview.map((p) => p.shareMinor)) : 0
  const serverError = mutation.error
    ? describeError(mutation.error, { currency: h.currency })
    : null
  return (
    <form className="ft-form" onSubmit={onSubmit} noValidate aria-label="Split an expense">
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
        label="Total to split"
        value={total}
        onChange={setTotal}
        currency={h.currency}
        error={errors.total ?? (serverError?.field === 'amount' ? serverError.message : undefined)}
      />
      <DescriptionField value={description} onChange={setDescription} error={errors.description} />

      <fieldset className="ft-fieldset">
        <legend>Who shares it</legend>
        <p className="ft-muted">
          Each person pays their weight divided by the total of all weights. Leftover cents go to
          the largest remainders, and ties to whoever is listed first.
        </p>
        {pots.map((p) => {
          const s = shares[p.id] ?? { included: true, weight: '1' }
          return (
            <div key={p.id} className="ft-share-row">
              <Checkbox
                label={h.memberName(p.ownerUid ?? '')}
                checked={s.included}
                onCheckedChange={(v) => update(p.id, { included: v === true })}
              />
              <Field label={`Weight for ${h.memberName(p.ownerUid ?? '')}`} hideLabel>
                <Input
                  inputMode="numeric"
                  value={s.weight}
                  disabled={!s.included}
                  onChange={(e) => update(p.id, { weight: e.target.value })}
                />
              </Field>
            </div>
          )
        })}
        {errors.shares ? (
          <div role="alert" className="ft-field-error">
            {errors.shares}
          </div>
        ) : null}
      </fieldset>

      <section aria-labelledby="split-preview" className="ft-preview">
        <h3 id="split-preview" className="ft-h3">
          Split preview
        </h3>
        {preview && parsedTotal.ok ? (
          <>
            <table className="ft-table" aria-label="Split preview">
              <thead>
                <tr>
                  <th scope="col">Pot</th>
                  <th scope="col" className="ft-num">
                    Weight
                  </th>
                  <th scope="col" className="ft-num">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.id}>
                    <td>{h.accountName(row.id)}</td>
                    <td className="ft-num">{row.weight}</td>
                    <td className="ft-num">
                      <MoneyText minor={row.shareMinor} currency={h.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td />
                  <td className="ft-num">
                    <MoneyText minor={allocated} currency={h.currency} />
                  </td>
                </tr>
              </tfoot>
            </table>
            <p role="status" className="ft-muted">
              {allocated === parsedTotal.minor
                ? `The shares add up to exactly ${formatMinor(parsedTotal.minor, h.currency)}.`
                : 'The shares do not add up to the total.'}
            </p>
          </>
        ) : (
          <p className="ft-muted">Enter a total and choose who shares it to see the exact split.</p>
        )}
      </section>

      <SubmitRow
        label="Record split"
        loading={mutation.isPending}
        error={serverError?.field ? null : mutation.error}
        currency={h.currency}
      />
    </form>
  )
}
