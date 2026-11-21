import { Field, Input, Select } from '@platform/ui'
import { SOURCE_TYPES, type SourceType } from '../api/types'
import { SOURCE_LABELS } from '../lib/labels'

export function SourceSelect({
  value,
  onChange,
  options = SOURCE_TYPES,
}: {
  value: SourceType
  onChange: (value: SourceType) => void
  options?: readonly SourceType[]
}) {
  return (
    <Field label="Kind" description="Lets you filter searches by where something came from.">
      <Select value={value} onChange={(e) => onChange(e.target.value as SourceType)}>
        {options.map((type) => (
          <option key={type} value={type}>
            {SOURCE_LABELS[type]}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/** Optional "update instead of duplicate" identifier, tucked away because most people never need it. */
export function ExternalIdField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string | undefined
}) {
  return (
    <details className="ayl-advanced">
      <summary>Advanced: update an existing item</summary>
      <Field
        label="External ID"
        description="Add the same ID again with new text to update that item in place instead of saving a copy."
        error={error}
      >
        <Input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      </Field>
    </details>
  )
}
