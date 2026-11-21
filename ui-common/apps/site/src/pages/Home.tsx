import {
  ChevronDownIcon,
  Illustration,
  PersonaBadge,
  ProductMark,
  Section,
  SectionHeader,
  personas,
} from '@platform/ui'
import { Link } from 'react-router-dom'
import { CtaPair } from '../components/CtaPair'
import { controls } from '../content/security'
import { faq } from '../content/faq'
import { formatNumber, personaSummaries, plans } from '../content/platform'
import { products } from '../content/products'
import { usePageMeta } from '../hooks/usePageMeta'
import { productPath } from '../routes'
import { HeroTicket } from './HeroTicket'
import styles from './Home.module.css'

const howItWorks = [
  {
    illustration: 'empty',
    title: 'Sign in once',
    text: 'One Google or email sign-in covers all six products. Or look around first with the demo: no account, no setup.',
  },
  {
    illustration: 'letter',
    title: 'Put the paperwork in',
    text: 'Track what you are owed, register appliances, add notes, seal a legacy vault, open a household ledger. Each product keeps one kind of paperwork.',
  },
  {
    illustration: 'key',
    title: 'Lend access, not the vault',
    text: 'Apps ask for a narrow, timed slice. People you trust hold a share of a key, never the contents. You can revoke, and every read is logged.',
  },
] as const

const securityHighlights = ['sign-in', 'permissions', 'tokens', 'audit', 'legacy', 'rls'] as const

export function Home() {
  usePageMeta({
    title: 'My-Trove: keep your paperwork in one place, share only what you choose',
    description:
      'My-Trove is six products for the paperwork of life on one platform: chase what you are owed, lend your data to apps, watch appliances, search your notes, plan a legacy and keep household books.',
  })

  return (
    <>
      <Section
        tone="vault"
        size="hero"
        container="wide"
        pattern="rings"
        aria-labelledby="hero-title"
        className={styles.hero}
      >
        <div className={styles.heroGrid}>
          <div className={styles.heroText}>
            <p className={styles.tagline}>A vault you can lend from</p>
            <h1 id="hero-title" className={styles.heroTitle}>
              Keep your paperwork in one place. Share only what you choose.
            </h1>
            <p className={styles.heroLead}>
              My-Trove follows up on what you are owed, watches your appliances, searches your
              records, plans what you leave behind and keeps the household books. Apps and trusted
              people see only what you approve, and you can take it back.
            </p>
            <div className={styles.heroActions}>
              <CtaPair size="lg" />
            </div>
            <p className={styles.heroNote}>
              The demo runs in your browser on sample data. No account needed.
            </p>
          </div>
          <HeroTicket />
        </div>
      </Section>

      <Section size="lg" aria-labelledby="how-title" id="how-it-works">
        <SectionHeader
          headingId="how-title"
          title="Three steps, and you stay in charge"
          description="My-Trove is built around one idea: your records are yours, and anyone else sees them only because you said so."
        />
        <ol className={styles.how}>
          {howItWorks.map((step, index) => (
            <li key={step.title} className={styles.howStep}>
              <Illustration name={step.illustration} size={176} className={styles.howArt} />
              <h3 className={styles.howTitle}>
                <span className={styles.howNumber} aria-hidden="true">
                  {index + 1}
                </span>
                {step.title}
              </h3>
              <p className={styles.howText}>{step.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="paper" size="lg" aria-labelledby="products-title" id="products">
        <SectionHeader
          headingId="products-title"
          title="Six products, each for one kind of paperwork"
          description="They share a sign-in, a look and a platform. Each also rests on one piece of heavy engineering that a spreadsheet could not do."
        />
        <ul className={styles.products}>
          {products.map((product) => (
            <li key={product.id} className={styles.product} data-product={product.id}>
              <ProductMark product={product.id} size={52} />
              <div className={styles.productMain}>
                <h3 className={styles.productName}>
                  <Link to={productPath(product.id)} className={styles.productLink}>
                    {product.name}
                  </Link>
                </h3>
                <p>{product.summary}</p>
              </div>
              <p className={styles.productHard}>
                <span className={styles.productHardLabel}>Under the hood</span>
                {product.hardPart}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section size="lg" aria-labelledby="platform-title">
        <div className={styles.split}>
          <div className={styles.splitText}>
            <SectionHeader
              headingId="platform-title"
              title="A platform underneath, not six separate apps"
              description="Every request goes through one gateway that checks who you are, what you may do and which plan you are on, then passes it on and counts it."
            />
            <p className={styles.body}>
              Five personas, scoped consent for third-party apps and usage metering are built. API
              keys, webhooks and an SDK arrive with the developer portal, which is not built yet.
            </p>
            <p>
              <Link to="/platform">How the platform fits together</Link>
            </p>
          </div>
          <ul className={styles.personas} aria-label="The five personas">
            {personas.map((persona) => (
              <li key={persona} className={styles.persona}>
                <PersonaBadge persona={persona} />
                <span>{personaSummaries[persona]}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="sunken" size="lg" aria-labelledby="security-title">
        <SectionHeader
          headingId="security-title"
          title="Trust you can check"
          description="Everything below is built and tested. The security page also says, just as plainly, what is not."
        />
        <ul className={styles.controls}>
          {securityHighlights.map((id) => {
            const control = controls.find((c) => c.id === id)
            if (!control) return null
            return (
              <li key={id} className={styles.control}>
                <h3 className={styles.controlTitle}>{control.title}</h3>
                <p>{control.what}</p>
              </li>
            )
          })}
        </ul>
        <p className={styles.sectionLink}>
          <Link to="/security">Everything that is built, and every limit</Link>
        </p>
      </Section>

      <Section size="lg" aria-labelledby="plans-title" id="plans">
        <SectionHeader
          headingId="plans-title"
          title="Plans are limits, not prices"
          description="Three plans set how many requests you can make. Billing is simulated: there are no prices and nobody is charged."
        />
        <ul className={styles.plans}>
          {plans.map((plan) => (
            <li key={plan.id} className={styles.plan}>
              <h3 className={styles.planName}>{plan.name}</h3>
              <p className={styles.planBig}>
                {formatNumber(plan.requestsPerMinute)}
                <span className={styles.planUnit}> requests a minute</span>
              </p>
              <p className={styles.planSmall}>
                {formatNumber(plan.requestsPerMonth)} requests a month
              </p>
            </li>
          ))}
        </ul>
        <p className={styles.sectionLink}>
          <Link to="/pricing">Compare plans, including API key and webhook limits</Link>
        </p>
      </Section>

      <Section tone="paper" size="lg" aria-labelledby="faq-title" id="faq">
        <div className={styles.faqGrid}>
          <SectionHeader headingId="faq-title" title="Questions people ask" />
          <div className={styles.faq}>
            {faq.map((item) => (
              <details key={item.question} className={styles.faqItem}>
                <summary className={styles.faqSummary}>
                  <span>{item.question}</span>
                  <ChevronDownIcon size={20} className={styles.faqChevron} />
                </summary>
                <p className={styles.faqAnswer}>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      <Section
        tone="vault"
        size="lg"
        container="narrow"
        pattern="keycut"
        aria-labelledby="cta-title"
      >
        <div className={styles.final}>
          <h2 id="cta-title" className={styles.finalTitle}>
            Look around first, or open the vault.
          </h2>
          <p className={styles.finalLead}>
            The demo needs nothing from you. The workspace needs the local stack running, and the
            docs have the commands.
          </p>
          <div className={styles.heroActions}>
            <CtaPair size="lg" />
          </div>
          <p className={styles.finalLink}>
            <Link to="/docs">Read the docs</Link>
          </p>
        </div>
      </Section>
    </>
  )
}
