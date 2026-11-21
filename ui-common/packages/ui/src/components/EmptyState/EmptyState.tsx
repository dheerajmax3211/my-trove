import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import styles from './EmptyState.module.css'

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** A small glyph in a tinted disc. Ignored when `illustration` is set. */
  icon?: ReactNode
  /**
   * A drawing above the title, e.g. `<IllustrationEmpty />` or `<Illustration name="letter" />`.
   * Decorative: it is wrapped in an aria-hidden container, so the title and description carry the meaning.
   */
  illustration?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Typically a <Button>. */
  action?: ReactNode
  /** A quieter secondary link or button beside the action. */
  secondaryAction?: ReactNode
  /** Heading element for the title. Default h2. */
  headingAs?: Extract<ElementType, 'h2' | 'h3' | 'h4'>
}

/**
 * An empty screen is an invitation: say what belongs here and offer the one thing to do next.
 * Pair it with an illustration for a page or a main panel, and an icon for a small card or table.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  {
    icon,
    illustration,
    title,
    description,
    action,
    secondaryAction,
    headingAs: Heading = 'h2',
    className,
    ...rest
  },
  ref,
) {
  return (
    <div ref={ref} className={cx(styles.empty, className)} {...rest}>
      {illustration ? (
        <div className={styles.illustration} aria-hidden="true">
          {illustration}
        </div>
      ) : icon ? (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <Heading className={styles.title}>{title}</Heading>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action || secondaryAction ? (
        <div className={styles.action}>
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
})
