import { forwardRef, type InputHTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import { useFieldControl } from '../../internal/field-context'
import styles from './Input.module.css'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg'
  /** Marks the control invalid (aria-invalid). Set automatically inside <Field error="...">. */
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid, className, id, required, disabled, type = 'text', ...rest },
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
  return (
    <input
      ref={ref}
      type={type}
      className={cx(styles.input, size !== 'md' && styles[size], className)}
      {...rest}
      id={control.id}
      aria-describedby={control['aria-describedby']}
      aria-invalid={control['aria-invalid']}
      aria-required={control['aria-required']}
      disabled={control.disabled}
    />
  )
})
