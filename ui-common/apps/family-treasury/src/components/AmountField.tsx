import { Field, Input } from '@platform/ui'
import { currencySymbol } from '../lib/money'

export interface AmountFieldProps {
  label?: string
  value: string
  onChange: (value: string) => void
  currency: string
  error?: string | undefined
  description?: string
  required?: boolean
}

/** Text input for a money amount. Parsing is exact and happens on submit (see lib/money.parseAmount). */
export function AmountField({
  label = 'Amount',
  value,
  onChange,
  currency,
  error,
  description,
  required = true,
}: AmountFieldProps) {
  return (
    <Field
      label={label}
      required={required}
      error={error}
      description={
        description ?? `In ${currency} (${currencySymbol(currency)}). For example 12.50.`
      }
    >
      <Input
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}
