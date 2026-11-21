import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import styles from './EmptyState.module.css'

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Typically a <Button>. */
  action?: ReactNode
  /** Heading element for the title. Default h2. */
  headingAs?: Extract<ElementType, 'h2' | 'h3' | 'h4'>
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, title, description, action, headingAs: Heading = 'h2', className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx(styles.empty, className)} {...rest}>
      {icon ? (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <Heading className={styles.title}>{title}</Heading>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
})
