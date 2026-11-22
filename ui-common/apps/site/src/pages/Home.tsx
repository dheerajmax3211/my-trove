import { Reveal } from '@platform/ui'
import { Link } from 'react-router-dom'
import { PlanCards } from '../components/PlanCards'
import { usePageMeta } from '../hooks/usePageMeta'
import { ClosingCta } from '../sections/ClosingCta'
import { Faq } from '../sections/Faq'
import { Hero } from '../sections/Hero'
import { CapabilityStrip, Numbers } from '../sections/Numbers'
import { PlatformBento } from '../sections/PlatformBento'
import { ProductCards } from '../sections/ProductCards'
import { ScrollStory } from '../sections/ScrollStory'
import { Showcase } from '../sections/Showcase'
import { TrustBento } from '../sections/TrustBento'
import styles from './Home.module.css'

export function Home() {
  usePageMeta({
    title: 'My-Trove: keep your paperwork in one place, share only what you choose',
    description:
      'My-Trove is six products for the paperwork of life on one platform: chase what you are owed, lend your data to apps, watch appliances, search your notes, plan a legacy and keep household books.',
  })

  return (
    <>
      <Hero />
      <CapabilityStrip />
      <ScrollStory />
      <ProductCards />
      <Showcase />
      <Numbers />
      <TrustBento />
      <PlatformBento />
      <section
        id="plans"
        className={`st-wrap st-section ${styles.plans}`}
        aria-labelledby="plans-title"
      >
        <Reveal className="st-head">
          <h2 id="plans-title" className="st-h2">
            Plans are limits, not prices
          </h2>
          <p className="st-lead">
            Three plans set how many requests you can make. Billing is simulated: there are no
            prices and nobody is charged.
          </p>
        </Reveal>
        <PlanCards />
        <p className={styles.more}>
          <Link to="/pricing">Compare plans, including API key and webhook limits</Link>
        </p>
      </section>
      <Faq />
      <ClosingCta />
    </>
  )
}
