import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import { useFieldControl } from '../../internal/field-context'
import { ChevronDownIcon } from '../../internal/icons'
import inputStyles from '../Input/Input.module.css'
import styles from './Select.module.css'

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg'
  invalid?: boolean
  /** Renders a disabled, empty first option as a prompt (use with value/defaultValue ""). */
  placeholder?: string
}

/**
 * Styled native <select>. Native is deliberate: it gives correct mobile pickers, form
 * participation and type-ahead for free, and is the most reliably accessible option.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', invalid, placeholder, className, id, required, disabled, children, ...rest },
  ref,
) {
  const control = useFieldControl({
    id,
    'aria-describedby': rest['aria-describedby'],
    'aria-invalid': rest['aria-invalid'],
    disabled,
    invalid,
    required,
  })
  const hasValue = rest.value !== undefined || rest.defaultValue !== undefined
  return (
    <span className={styles.wrapper}>
      <select
        ref={ref}
        className={cx(
          inputStyles.input,
          styles.select,
          size !== 'md' && inputStyles[size],
          className,
        )}
        {...rest}
        defaultValue={hasValue || !placeholder ? rest.defaultValue : ''}
        id={control.id}
        aria-describedby={control['aria-describedby']}
        aria-invalid={control['aria-invalid']}
        aria-required={control['aria-required']}
        disabled={control.disabled}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>
      <span className={styles.chevron}>
        <ChevronDownIcon size={18} />
      </span>
    </span>
  )
})
