import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../internal/cx'
import styles from './PageHeader.module.css'

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Rendered as the page's <h1>. There should be exactly one per page. */
  title: ReactNode
  description?: ReactNode
  /** Small label above the title (e.g. product or section name). */
  eyebrow?: ReactNode
  /** Buttons etc. aligned to the end on wide screens, wrapping below on narrow ones. */
  actions?: ReactNode
}

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { title, description, eyebrow, actions, className, ...rest },
  ref,
) {
  return (
    <header ref={ref} className={cx(styles.header, className)} {...rest}>
      <div className={styles.text}>
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  )
})
