import { Reveal, SplitText } from '@platform/ui'
import { Link } from 'react-router-dom'
import { CtaPair } from '../components/CtaPair'
import { HeroBackdrop } from '../components/HeroBackdrop'
import styles from './ClosingCta.module.css'

/** The last screen: the same lit stage as the hero, one sentence and the two actions. */
export function ClosingCta() {
  return (
    <section className={`st-dark ${styles.band}`} data-theme="dark" aria-labelledby="cta-title">
      <HeroBackdrop palette="warm" intensity="medium" />
      <div className={`st-wrap ${styles.inner}`}>
        <SplitText as="h2" id="cta-title" className={styles.title}>
          Look around first, or open the vault.
        </SplitText>
        <Reveal delay={0.2} className={styles.lead}>
          <p>
            The demo needs nothing from you. The workspace needs the local stack running, and the
            docs have the commands.
          </p>
        </Reveal>
        <Reveal delay={0.35} className={`st-actions ${styles.actions}`}>
          <CtaPair size="lg" glow />
        </Reveal>
        <Reveal delay={0.45} direction="none">
          <Link to="/docs" className={styles.link}>
            Read the docs
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
