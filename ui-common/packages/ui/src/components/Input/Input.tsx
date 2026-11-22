import { forwardRef, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import { useFieldControl } from '../../internal/field-context'
import styles from './Input.module.css'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg'
  /** Marks the control invalid (aria-invalid). Set automatically inside <Field error="...">. */
  invalid?: boolean
  /** An icon or short text inside the start edge (a search glass, a currency sign). Decorative. */
  leading?: ReactNode
  /** Something interactive or informative inside the end edge (a clear button, a unit). */
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = 'md',
    invalid,
    leading,
    trailing,
    className,
    id,
    required,
    disabled,
    type = 'text',
    placeholder,
    ...rest
  },
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
  const input = (
    <input
      ref={ref}
      type={type}
      className={cx(styles.input, size !== 'md' && styles[size], className)}
      {...rest}
      placeholder={control.floating ? (placeholder ?? ' ') : placeholder}
      id={control.id}
      aria-describedby={control['aria-describedby']}
      aria-invalid={control['aria-invalid']}
      aria-required={control['aria-required']}
      disabled={control.disabled}
    />
  )
  if (!leading && !trailing) return input
  return (
    <div
      className={styles.group}
      style={
        {
          ...(leading ? { '--_lead': '2.75rem' } : {}),
          ...(trailing ? { '--_trail': '2.75rem' } : {}),
        } as CSSProperties
      }
    >
      {leading ? (
        <span className={styles.leading} aria-hidden="true">
          {leading}
        </span>
      ) : null}
      {input}
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </div>
  )
})
