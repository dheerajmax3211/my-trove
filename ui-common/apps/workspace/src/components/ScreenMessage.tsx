import { Logo, Spinner } from '@platform/ui'
import type { ReactNode } from 'react'
import styles from './ScreenMessage.module.css'

/** A whole-screen message for the moments before the workspace shell exists (loading, cannot start). */
export function ScreenMessage({
  title,
  description,
  actions,
  busy = false,
}: {
  title: string
  description?: string
  actions?: ReactNode
  busy?: boolean
}) {
  return (
    <main className={styles.screen} aria-busy={busy || undefined}>
      <Logo size="md" />
      <div className={styles.body}>
        {busy ? <Spinner size={28} label={title} /> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </main>
  )
}
