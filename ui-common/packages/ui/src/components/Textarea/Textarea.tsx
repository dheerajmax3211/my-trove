import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cx } from '../../internal/cx'
import { useFieldControl } from '../../internal/field-context'
import inputStyles from '../Input/Input.module.css'
import styles from './Textarea.module.css'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, id, required, disabled, rows = 4, placeholder, ...rest },
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
    <textarea
      ref={ref}
      rows={rows}
      className={cx(inputStyles.input, styles.textarea, className)}
      {...rest}
      placeholder={control.floating ? (placeholder ?? ' ') : placeholder}
      id={control.id}
      aria-describedby={control['aria-describedby']}
      aria-invalid={control['aria-invalid']}
      aria-required={control['aria-required']}
      disabled={control.disabled}
    />
  )
})
