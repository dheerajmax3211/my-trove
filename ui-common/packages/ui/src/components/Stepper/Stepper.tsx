import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../../internal/cx'
import { CheckIcon } from '../../internal/icons'
import { VisuallyHidden } from '../VisuallyHidden/VisuallyHidden'
import styles from './Stepper.module.css'

export interface StepperStep {
  id: string
  label: ReactNode
  description?: ReactNode
}

export interface StepperProps extends Omit<HTMLAttributes<HTMLOListElement>, 'children'> {
  steps: readonly StepperStep[]
  /** Zero-based index of the current step. Steps before it are complete. */
  current: number
  orientation?: 'horizontal' | 'vertical'
  /** Makes completed steps clickable (a way back). Called with the step's index. */
  onStepSelect?: (index: number) => void
  /** Accessible name of the list. Default "Progress". */
  label?: string
  /** Spoken status words, for translation. */
  statusLabels?: { complete: string; current: string; upcoming: string }
}

const DEFAULT_STATUS = { complete: 'Completed', current: 'Current step', upcoming: 'Not started' }

/**
 * Onboarding and wizard progress. An ordered list: each step says whether it is done, current
 * or still ahead in text, not only by color. The current step carries aria-current="step".
 */
export function Stepper({
  steps,
  current,
  orientation = 'horizontal',
  onStepSelect,
  label = 'Progress',
  statusLabels = DEFAULT_STATUS,
  className,
  ...rest
}: StepperProps) {
  return (
    <ol
      aria-label={label}
      data-orientation={orientation}
      className={cx(styles.stepper, styles[orientation], className)}
      {...rest}
    >
      {steps.map((step, index) => {
        const state = index < current ? 'complete' : index === current ? 'current' : 'upcoming'
        const clickable = state === 'complete' && onStepSelect !== undefined
        const body = (
          <>
            <span className={styles.marker} aria-hidden="true">
              {state === 'complete' ? <CheckIcon size={14} /> : index + 1}
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{step.label}</span>
              {step.description ? (
                <span className={styles.description}>{step.description}</span>
              ) : null}
              <VisuallyHidden>{`, ${statusLabels[state]}`}</VisuallyHidden>
            </span>
          </>
        )
        return (
          <li
            key={step.id}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className={styles.step}
          >
            {clickable ? (
              <button type="button" className={styles.button} onClick={() => onStepSelect(index)}>
                {body}
              </button>
            ) : (
              <div className={styles.static}>{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
