import { Field, Select } from '@platform/ui'
import type { ReactNode } from 'react'
import type { AccountView } from '../../../api/types'
import { formatMinor } from '../../../lib/money'

export interface AccountSelectProps {
  label: string
  value: string
  onChange: (id: string) => void
  accounts: readonly AccountView[]
  /** Show each account's balance in the option text. */
  showBalance?: boolean
  error?: string | undefined
  description?: ReactNode
}

export function AccountSelect({
  label,
  value,
  onChange,
  accounts,
  showBalance = false,
  error,
  description,
}: AccountSelectProps) {
  return (
    <Field label={label} required error={error} description={description}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {showBalance ? `${a.name} (${formatMinor(a.balanceMinor, a.currency)})` : a.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}
