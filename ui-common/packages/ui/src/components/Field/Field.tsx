import {
  forwardRef,
  useId,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
} from 'react'
import { cx } from '../../internal/cx'
import { FieldContext } from '../../internal/field-context'
import { AlertIcon } from '../../internal/icons'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './Field.module.css'

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Appends a visual required marker (the control itself carries aria-required). */
  required?: boolean
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { required, className, children, ...rest },
  ref,
) {
  return (
    <label ref={ref} className={cx(styles.label, className)} {...rest}>
      {children}
      {required ? (
        <span className={styles.required} aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  )
})

export interface FieldErrorProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** Error text. Announced when it appears (role="alert") and referenced by aria-describedby. */
export const FieldError = forwardRef<HTMLDivElement, FieldErrorProps>(function FieldError(
  { className, children, ...rest },
  ref,
) {
  if (!children) return null
  return (
    <div ref={ref} role="alert" className={cx(styles.error, className)} {...rest}>
      <AlertIcon size={16} className={styles.errorIcon} />
      <span>{children}</span>
    </div>
  )
})

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: ReactNode
  /** Visually hide the label but keep it for assistive tech. */
  hideLabel?: boolean
  description?: ReactNode
  /** When set, the control is marked aria-invalid and the message is announced. */
  error?: ReactNode
  required?: boolean
  disabled?: boolean
  /** Override the generated control id. */
  controlId?: string
  /** Exactly one form control (Input, Textarea, Select, Checkbox...). */
  children: ReactNode
}

/**
 * Wires a label, description and error message to the control inside it by id, so the control
 * is named by the label and described by the hint and error text.
 */
export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    label,
    hideLabel,
    description,
    error,
    required = false,
    disabled = false,
    controlId,
    className,
    children,
    ...rest
  },
  ref,
) {
  const generated = useId()
  const id = controlId ?? `${generated}-control`
  const descriptionId = description ? `${generated}-description` : undefined
  const invalid = Boolean(error)
  const errorId = invalid ? `${generated}-error` : undefined

  return (
    <FieldContext value={{ id, descriptionId, errorId, invalid, required, disabled }}>
      <div ref={ref} className={cx(styles.field, disabled && styles.disabled, className)} {...rest}>
        {hideLabel ? (
          <VisuallyHidden asChild>
            <Label htmlFor={id}>{label}</Label>
          </VisuallyHidden>
        ) : (
          <Label htmlFor={id} required={required}>
            {label}
          </Label>
        )}
        {children}
        {description ? (
          <div id={descriptionId} className={styles.description}>
            {description}
          </div>
        ) : null}
        {invalid ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>
    </FieldContext>
  )
})
