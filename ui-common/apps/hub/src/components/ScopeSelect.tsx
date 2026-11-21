import { Field, Select } from '@platform/ui'
import type { Household } from '../features/households/types'

export const SCOPE_ALL = 'all'
export const SCOPE_PERSONAL = 'personal'

interface ScopeSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  households: readonly Household[]
  /** Adds an "Everything I can see" option (for filters; not for create forms). */
  includeAll?: boolean
  description?: string
}

/** Personal, or one of the user's households. The value is `personal` or a household id. */
export function ScopeSelect({
  label,
  value,
  onChange,
  households,
  includeAll = false,
  description,
}: ScopeSelectProps) {
  return (
    <Field label={label} {...(description ? { description } : {})}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {includeAll ? <option value={SCOPE_ALL}>Personal and all households</option> : null}
        <option value={SCOPE_PERSONAL}>Personal only</option>
        {households.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/** "Personal" or the household's name (falls back to a generic word while households load). */
export function scopeName(householdId: string | null, households: readonly Household[]): string {
  if (householdId === null) return 'Personal'
  return households.find((h) => h.id === householdId)?.name ?? 'Household'
}
