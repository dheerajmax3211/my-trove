import {
  forwardRef,
  useId,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
} from 'react'
import { cx } from '../../internal/cx'
import { FieldContext } from '../../internal/field-context'
import { AlertIcon, CheckIcon } from '../../internal/icons'
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
  /**
   * `stacked` (default): the label sits above the control. `floating`: the label sits inside the
   * control and lifts when it has focus or a value. Floating suits short single-line fields;
   * use stacked for textareas, long labels and anything with a helper paragraph.
   */
  variant?: 'stacked' | 'floating'
  description?: ReactNode
  /** When set, the control is marked aria-invalid and the message is announced. */
  error?: ReactNode
  /** Shows a check on the control and, if text, a confirming line ("Looks good"). */
  success?: ReactNode | boolean
  /** Right-aligned note on the label row: "Optional", "0 / 200". */
  hint?: ReactNode
  required?: boolean
  disabled?: boolean
  /** Override the generated control id. */
  controlId?: string
  /** Exactly one form control (Input, Textarea, Select, Checkbox...). */
  children: ReactNode
}

/**
 * Wires a label, description and error message to the control inside it by id, so the control
 * is named by the label and described by the hint and error text. Validation states animate: the
 * error eases in under the control, the control shakes once, and success draws a check.
 */
export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    label,
    hideLabel,
    variant = 'stacked',
    description,
    error,
    success,
    hint,
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
  const floating = variant === 'floating' && !hideLabel
  const valid = Boolean(success) && !invalid
  const labelNode = hideLabel ? (
    <VisuallyHidden asChild>
      <Label htmlFor={id}>{label}</Label>
    </VisuallyHidden>
  ) : (
    <Label htmlFor={id} required={required} className={floating ? styles.floatLabel : undefined}>
      {label}
    </Label>
  )

  return (
    <FieldContext
      value={{ id, descriptionId, errorId, invalid, required, disabled, floating, valid }}
    >
      <div
        ref={ref}
        className={cx(
          styles.field,
          floating && styles.floating,
          disabled && styles.disabled,
          className,
        )}
        data-invalid={invalid || undefined}
        data-valid={valid || undefined}
        {...rest}
      >
        {!floating ? (
          <div className={styles.labelRow}>
            {labelNode}
            {hint ? <span className={styles.hint}>{hint}</span> : null}
          </div>
        ) : null}
        <div className={styles.control}>
          {children}
          {floating ? labelNode : null}
          {valid ? (
            <span className={styles.validMark} aria-hidden="true">
              <CheckIcon size={14} />
            </span>
          ) : null}
        </div>
        {description ? (
          <div id={descriptionId} className={styles.description}>
            {description}
          </div>
        ) : null}
        {invalid ? (
          <div className={styles.reveal}>
            <FieldError id={errorId}>{error}</FieldError>
          </div>
        ) : null}
        {valid && typeof success !== 'boolean' ? (
          <div className={styles.reveal}>
            <div className={styles.success}>{success}</div>
          </div>
        ) : null}
      </div>
    </FieldContext>
  )
})
