import { Reveal, SplitText, cx } from '@platform/ui'
import type { CSSProperties, ReactNode } from 'react'
import { HeroBackdrop } from './HeroBackdrop'
import styles from './PageHero.module.css'

export interface PageHeroProps {
  /** The page's only h1. A plain string so it can be revealed word by word. */
  title: string
  lead: ReactNode
  /** A small line above the title (a breadcrumb, a product mark). Use it only when it names something. */
  top?: ReactNode
  actions?: ReactNode
  /** Visual on the right (a dashboard preview, a dial). It sits beside the text on wide screens. */
  aside?: ReactNode
  /** Product accent (an id) for the glow behind the title. */
  accent?: string
  className?: string
}

/** The opening of every page except the home page: a dark band, a big title that rises word by word, a standfirst. */
export function PageHero({ title, lead, top, actions, aside, accent, className }: PageHeroProps) {
  const style = accent
    ? ({ '--hero-accent': `var(--pp-color-product-${accent})` } as CSSProperties)
    : undefined
  return (
    <section
      className={cx('st-dark', styles.hero, aside ? styles.withAside : undefined, className)}
      data-theme="dark"
      aria-labelledby="page-title"
      style={style}
    >
      <HeroBackdrop palette={accent ? 'cool' : 'brand'} intensity="medium" />
      <div className={cx('st-wrap', styles.inner)}>
        <div className={styles.text}>
          {top ? (
            <Reveal direction="none" duration={0.9} className={styles.top}>
              {top}
            </Reveal>
          ) : null}
          <SplitText as="h1" id="page-title" className={styles.title} immediate delay={0.1}>
            {title}
          </SplitText>
          <Reveal delay={0.5} className={styles.lead}>
            <p>{lead}</p>
          </Reveal>
          {actions ? (
            <Reveal delay={0.65} className={cx('st-actions', styles.actions)}>
              {actions}
            </Reveal>
          ) : null}
        </div>
        {aside ? (
          <Reveal delay={0.4} distance={40} scale={0.97} duration={1} className={styles.aside}>
            {aside}
          </Reveal>
        ) : null}
      </div>
    </section>
  )
}
