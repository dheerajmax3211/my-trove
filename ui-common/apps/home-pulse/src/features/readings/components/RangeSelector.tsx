import { Button } from '@platform/ui'
import { RANGE_OPTIONS, type RangeKey } from '../types'

export interface RangeSelectorProps {
  value: RangeKey
  onChange: (range: RangeKey) => void
}

export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <div role="group" aria-label="Time range" className="hp-segmented">
      {RANGE_OPTIONS.map((option) => (
        <Button
          key={option.key}
          size="sm"
          variant={option.key === value ? 'primary' : 'secondary'}
          aria-pressed={option.key === value}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}
