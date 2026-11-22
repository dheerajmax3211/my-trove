import { Field, Input } from '@platform/ui'
import { SOURCE_TYPES, type SourceType } from '../api/types'
import { SOURCE_LABELS } from '../lib/labels'

/** What kind of thing this is, as pills. It lets you filter searches by where something came from. */
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
    <fieldset className="ayl-kind">
      <legend className="ayl-legend">Kind</legend>
      <div className="ayl-kind-pills">
        {options.map((type) => (
          <label key={type} className="ayl-kind-pill" data-checked={value === type}>
            <input
              type="radio"
              name="kind"
              value={type}
              checked={value === type}
              onChange={() => onChange(type)}
            />
            {SOURCE_LABELS[type]}
          </label>
        ))}
      </div>
      <p className="ayl-kind-hint">Lets you filter searches by where something came from.</p>
    </fieldset>
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
