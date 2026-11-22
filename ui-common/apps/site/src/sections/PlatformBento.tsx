import {
  ArrowRightIcon,
  BentoCard,
  BentoGrid,
  CodeIcon,
  KeyIcon,
  PersonaBadge,
  Reveal,
  UsersIcon,
  personas,
} from '@platform/ui'
import { Link } from 'react-router-dom'
import { personaSummaries } from '../content/platform'
import styles from './Bento.module.css'

/** The platform under the products: the gateway, scoped consent for apps, and the five personas. */
export function PlatformBento() {
  return (
    <section
      className={`st-wrap st-section ${styles.section}`}
      aria-labelledby="platform-title"
      id="platform"
    >
      <Reveal className="st-head">
        <h2 id="platform-title" className="st-h2">
          A platform underneath, not six separate apps
        </h2>
        <p className="st-lead">
          Every request goes through one gateway that checks who you are, what you may do and which
          plan you are on, then passes it on and counts it.
        </p>
      </Reveal>

      <BentoGrid>
        <BentoCard span={7} title="One gateway in front" icon={<KeyIcon size={18} />}>
          <p className={styles.text}>
            Five personas, scoped consent for third-party apps and usage metering are built. The
            products stay simple because who is calling, what they may do and what they have used is
            settled before they see the call.
          </p>
          <Link to="/platform" className={styles.more}>
            How the platform fits together
            <ArrowRightIcon size={16} aria-hidden="true" />
          </Link>
        </BentoCard>
        <BentoCard span={5} tone="lilac" title="Apps ask, you answer" icon={<CodeIcon size={18} />}>
          <p className={styles.text}>
            An app can already ask for scoped, revocable access to a person&apos;s data through
            Consent. API keys, webhooks and an SDK arrive with the developer portal, which is not
            built yet.
          </p>
        </BentoCard>
        <BentoCard
          span={12}
          title="Five personas, access denied by default"
          icon={<UsersIcon size={18} />}
        >
          <ul className={styles.personas}>
            {personas.map((persona) => (
              <li key={persona} className={styles.persona}>
                <PersonaBadge persona={persona} />
                <span className={styles.text}>{personaSummaries[persona]}</span>
              </li>
            ))}
          </ul>
        </BentoCard>
      </BentoGrid>
    </section>
  )
}
