import { Button, Checkbox, Field, Input } from '@platform/ui'
import { useState } from 'react'
import { SOURCE_TYPES, type SourceType } from '../../documents/api/types'
import { SOURCE_LABELS } from '../../documents/lib/labels'
import { dateRangeError, hasActiveFilters, type SearchState } from '../api/searchApi'

type FilterValues = Pick<SearchState, 'sourceTypes' | 'from' | 'to'>

export function Filters({
  value,
  onChange,
}: {
  value: SearchState
  onChange: (next: Partial<FilterValues>) => void
}) {
  const active = hasActiveFilters(value)
  const [open, setOpen] = useState(active)
  const count = value.sourceTypes.length + (value.from ? 1 : 0) + (value.to ? 1 : 0)
  const rangeError = dateRangeError(value)

  const toggleType = (type: SourceType, checked: boolean) => {
    const next = checked
      ? [...value.sourceTypes, type]
      : value.sourceTypes.filter((t) => t !== type)
    onChange({ sourceTypes: SOURCE_TYPES.filter((t) => next.includes(t)) })
  }

  return (
    <div className="ayl-filters">
      <div className="ayl-filters-bar">
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={open}
          aria-controls="search-filters"
          onClick={() => setOpen((o) => !o)}
        >
          {count > 0 ? `Filters (${count})` : 'Filters'}
        </Button>
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ sourceTypes: [], from: '', to: '' })}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
      {open ? (
        <div id="search-filters" className="ayl-filter-panel">
          <fieldset className="ayl-fieldset">
            <legend className="ayl-legend">Source</legend>
            <div className="ayl-checks">
              {SOURCE_TYPES.map((type) => (
                <Checkbox
                  key={type}
                  label={SOURCE_LABELS[type]}
                  checked={value.sourceTypes.includes(type)}
                  onCheckedChange={(checked) => toggleType(type, checked === true)}
                />
              ))}
            </div>
          </fieldset>
          <fieldset className="ayl-fieldset">
            <legend className="ayl-legend">Date added</legend>
            <div className="ayl-dates">
              <Field label="From">
                <Input
                  type="date"
                  value={value.from}
                  onChange={(e) => onChange({ from: e.target.value })}
                />
              </Field>
              <Field label="To" error={rangeError}>
                <Input
                  type="date"
                  value={value.to}
                  onChange={(e) => onChange({ to: e.target.value })}
                />
              </Field>
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  )
}
