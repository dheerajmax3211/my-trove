import { Parallax, PauseIcon, PlayIcon, Reveal, SplitText, useScrollSmooth } from '@platform/ui'
import { CtaPair } from '../components/CtaPair'
import { HeroBackdrop } from '../components/HeroBackdrop'
import { VaultDial } from '../components/VaultDial'
import { usePlayback } from '../motion/playback'
import styles from './Hero.module.css'

/** The home page's opening: the headline over generative motion, a pause control and a scroll cue. */
export function Hero() {
  const { playing, toggle, reduced } = usePlayback()
  const { scrollTo } = useScrollSmooth()
  return (
    <section
      className={`st-dark ${styles.hero}`}
      data-theme="dark"
      aria-labelledby="hero-title"
      data-playing={playing ? 'true' : 'false'}
    >
      <HeroBackdrop />
      <Parallax distance={-90} className={styles.art}>
        <VaultDial />
      </Parallax>

      <div className={`st-wrap ${styles.inner}`}>
        <Reveal direction="none" duration={1} className={styles.chipRow}>
          <p className="st-chip">A vault you can lend from</p>
        </Reveal>
        <SplitText as="h1" id="hero-title" className={styles.title} immediate delay={0.12}>
          Keep it safe. Lend it with care.
        </SplitText>
        <Reveal delay={0.75} className={styles.lead}>
          <p>
            My-Trove follows up on what you are owed, watches your appliances, searches your
            records, plans what you leave behind and keeps the household books. Apps and trusted
            people see only what you approve, and you can take it back.
          </p>
        </Reveal>
        <Reveal delay={0.95} className={`st-actions ${styles.actions}`}>
          <CtaPair size="lg" glow />
        </Reveal>
        <Reveal delay={1.1} direction="none">
          <p className={styles.note}>
            The demo runs in your browser on sample data. No account needed.
          </p>
        </Reveal>
      </div>

      <div className={`st-wrap ${styles.foot}`}>
        <button type="button" className={styles.cue} onClick={() => scrollTo('#how-it-works')}>
          Scroll to explore
          <span className={styles.cueLine} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.play}
          aria-pressed={!playing}
          disabled={reduced}
          onClick={toggle}
        >
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          <span>{reduced ? 'Motion is off' : playing ? 'Pause motion' : 'Play motion'}</span>
        </button>
      </div>
    </section>
  )
}
