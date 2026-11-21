import { Switch as SwitchPrimitive } from 'radix-ui'
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react'
import { cx } from '../../internal/cx'
import { useFieldControl } from '../../internal/field-context'
import styles from './Switch.module.css'

export interface SwitchProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: ReactNode
  description?: ReactNode
}

/** On/off setting that takes effect immediately (role="switch"). Use Checkbox for form values to submit. */
export const Switch = forwardRef<ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  function Switch({ label, description, className, id, disabled, required, ...rest }, ref) {
    const generated = useId()
    const control = useFieldControl({
      id: id ?? (label ? `${generated}-switch` : undefined),
      'aria-describedby': rest['aria-describedby'],
      disabled,
      required,
    })
    const hintId = description ? `${generated}-hint` : undefined
    const describedBy = [control['aria-describedby'], hintId].filter(Boolean).join(' ') || undefined

    return (
      <div className={cx(styles.root, className)} data-disabled={control.disabled ? '' : undefined}>
        <SwitchPrimitive.Root
          ref={ref}
          className={styles.track}
          {...rest}
          id={control.id}
          disabled={control.disabled}
          required={control.required}
          aria-describedby={describedBy}
        >
          <SwitchPrimitive.Thumb className={styles.thumb} />
        </SwitchPrimitive.Root>
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
