import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react'
import { cx } from '../../internal/cx'
import { useFieldControl } from '../../internal/field-context'
import { CheckIcon, MinusIcon } from '../../internal/icons'
import styles from './Checkbox.module.css'

export interface CheckboxProps extends Omit<
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  'children'
> {
  /** Visible label. If omitted, provide `aria-label`/`aria-labelledby` or wrap in <Field>. */
  label?: ReactNode
  /** Secondary text under the label (linked with aria-describedby). */
  description?: ReactNode
  invalid?: boolean
}

export const Checkbox = forwardRef<ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  function Checkbox(
    { label, description, invalid, className, id, disabled, required, ...rest },
    ref,
  ) {
    const generated = useId()
    const control = useFieldControl({
      id: id ?? (label ? `${generated}-checkbox` : undefined),
      'aria-describedby': rest['aria-describedby'],
      'aria-invalid': rest['aria-invalid'],
      disabled,
      invalid,
      required,
    })
    const hintId = description ? `${generated}-hint` : undefined
    const describedBy = [control['aria-describedby'], hintId].filter(Boolean).join(' ') || undefined

    return (
      <div className={cx(styles.root, className)} data-disabled={control.disabled ? '' : undefined}>
        <CheckboxPrimitive.Root
          ref={ref}
          className={styles.box}
          {...rest}
          id={control.id}
          disabled={control.disabled}
          required={control.required}
          aria-describedby={describedBy}
          aria-invalid={control['aria-invalid']}
        >
          <CheckboxPrimitive.Indicator>
            {rest.checked === 'indeterminate' ? (
              <MinusIcon size={14} strokeWidth={3} />
            ) : (
              <CheckIcon size={14} strokeWidth={3} />
            )}
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        {label ? (
          <div className={styles.text}>
            <label className={styles.label} htmlFor={control.id}>
              {label}
            </label>
            {description ? (
              <span id={hintId} className={styles.hint}>
                {description}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  },
)
