import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cx } from '../internal/cx'
import { ChevronDownIcon } from '../internal/icons'
import styles from './PillSelect.module.css'

export interface PillSelectOption {
  value: string
  label: string
}

export interface PillSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Accessible name ("Date range"). */
  label: string
  options: readonly PillSelectOption[]
  /** Leading icon inside the pill (a calendar). */
  icon?: ReactNode
  /** Small leading text, e.g. the date: "Nov 22". Shown before the select value. */
  lead?: ReactNode
}

/**
 * A round dropdown pill ("Nov 22 | Today"). A native <select> underneath, so it keeps the right
 * mobile picker, keyboard behaviour and form participation; the pill is only its skin.
 */
export const PillSelect = forwardRef<HTMLSelectElement, PillSelectProps>(function PillSelect(
  { label, options, icon, lead, className, ...rest },
  ref,
) {
  return (
    <span className={cx(styles.pill, className)}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {lead ? <span className={styles.prefix}>{lead}</span> : null}
      <select ref={ref} aria-label={label} className={styles.select} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={16} className={styles.chevron} />
    </span>
  )
})
