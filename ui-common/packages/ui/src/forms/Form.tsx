import {
  forwardRef,
  useId,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { cx } from '../internal/cx'
import styles from './Form.module.css'

export interface FormProps extends FormHTMLAttributes<HTMLFormElement> {
  /** Maximum width of the form body. Default `lg` (56rem). */
  width?: 'sm' | 'md' | 'lg' | 'full'
}

/**
 * The page-level form: vertical rhythm for its sections and room at the bottom so the sticky
 * `FormActions` bar never covers the last field. Compose with `FormSection`, `FormGrid` and
 * `FormActions`; see the gallery's "Forms" page for the pattern.
 */
export const Form = forwardRef<HTMLFormElement, FormProps>(function Form(
  { width = 'lg', className, ...rest },
  ref,
) {
  return (
    <form ref={ref} noValidate className={cx(styles.form, styles[width], className)} {...rest} />
  )
})

export interface FormSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** Heading level for the title. Default 2. */
  headingLevel?: 2 | 3 | 4
  children?: ReactNode
}

/**
 * A group of related fields. On wide screens the title and explanation sit in a left column and
 * the fields in a white card on the right, so a long form reads as a few clear chapters instead of
 * one wall of inputs. On phones it stacks.
 */
export function FormSection({
  title,
  description,
  headingLevel = 2,
  className,
  children,
  ...rest
}: FormSectionProps) {
  const id = useId()
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 3 ? 'h3' : 'h4'
  return (
    <section aria-labelledby={id} className={cx(styles.section, className)} {...rest}>
      <div className={styles.intro}>
        <Heading id={id} className={styles.sectionTitle}>
          {title}
        </Heading>
        {description ? <p className={styles.sectionDescription}>{description}</p> : null}
      </div>
      <div className={styles.card}>{children}</div>
    </section>
  )
}

export interface FormGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Columns on wide screens. Default 2; always 1 on phones. */
  columns?: 1 | 2 | 3
}

/** Lay fields out in a responsive grid. Give a field `style={{ gridColumn: '1 / -1' }}` to span the row. */
export function FormGrid({ columns = 2, className, ...rest }: FormGridProps) {
  return <div className={cx(styles.grid, styles[`cols${columns}`], className)} {...rest} />
}

export interface FormActionsProps extends HTMLAttributes<HTMLDivElement> {
  /** Left side: unsaved-changes note, last-saved time, a validation summary. */
  status?: ReactNode
  /** Slide the bar in only when there is something to save. Default true (always visible). */
  visible?: boolean
  /** Stick to the bottom of the scrolling area. Default true. */
  sticky?: boolean
}

/**
 * The action bar: a frosted strip pinned to the bottom of the form with a status on the left and
 * the buttons on the right (Cancel, then the primary action). It slides up when `visible` turns
 * true, so a form that is not dirty stays quiet.
 */
export function FormActions({
  status,
  visible = true,
  sticky = true,
  className,
  children,
  ...rest
}: FormActionsProps) {
  return (
    <div
      className={cx(styles.actions, sticky && styles.sticky, !visible && styles.hidden, className)}
      aria-hidden={visible ? undefined : true}
      {...rest}
    >
      <div className={styles.status} aria-live="polite">
        {status}
      </div>
      <div className={styles.buttons}>{children}</div>
    </div>
  )
}
