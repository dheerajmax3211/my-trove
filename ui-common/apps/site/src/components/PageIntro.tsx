import { Section, cx } from '@platform/ui'
import type { ReactNode } from 'react'
import styles from './PageIntro.module.css'

export interface PageIntroProps {
  /** The page's only h1. */
  title: ReactNode
  lead: ReactNode
  /** Names the place (not a topic): shown with the key-bit notch. */
  eyebrow?: ReactNode
  actions?: ReactNode
  className?: string
}

/** The opening of every page except the home page: a restrained h1 and a standfirst. */
export function PageIntro({ title, lead, eyebrow, actions, className }: PageIntroProps) {
  return (
    <Section size="md" aria-labelledby="page-title" className={cx(styles.intro, className)}>
      <div className={styles.text}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 id="page-title" className={styles.title}>
          {title}
        </h1>
        <p className={styles.lead}>{lead}</p>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </Section>
  )
}
