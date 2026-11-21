import { Field, Input, Select } from '@platform/ui'
import { useId } from 'react'
import type { DurationInput, DurationUnit } from './policyForm'

export function DurationField({
  label,
  description,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string
  description?: string
  value: DurationInput
  error?: string | undefined
  disabled?: boolean
  onChange: (next: DurationInput) => void
}) {
  const unitId = useId()
  return (
    <Field label={label} {...(description ? { description } : {})} {...(error ? { error } : {})}>
      <div className="duration-input">
        <Input
          inputMode="decimal"
          value={value.value}
          disabled={disabled ?? false}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
        <Select
          id={unitId}
          aria-label={`${label} unit`}
          value={value.unit}
          disabled={disabled ?? false}
          onChange={(e) => onChange({ ...value, unit: e.target.value as DurationUnit })}
        >
          <option value="hours">hours</option>
          <option value="days">days</option>
        </Select>
      </div>
    </Field>
  )
}
