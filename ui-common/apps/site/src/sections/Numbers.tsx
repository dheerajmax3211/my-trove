import { CountUp, Marquee, Stagger } from '@platform/ui'
import { permissions } from '../content/platform'
import { products } from '../content/products'
import styles from './Numbers.module.css'

/** Things the platform really does, each backed by a service or a test (see the security page). */
const capabilities = [
  'Follow-up schedules',
  'Scoped, timed consent',
  'Revocable access',
  'Hash-chained audit logs',
  'Row-level security',
  'Rate limits and quotas',
  'Threshold key sharing',
  'Hybrid search',
  'Double-entry ledger',
  'Learned normals for appliances',
]

/** A moving strip of things the platform really does. */
export function CapabilityStrip() {
  return (
    <div className={styles.strip} data-theme="dark">
      <Marquee duration={50} gap={56}>
        {capabilities.map((item) => (
          <span key={item} className={styles.item}>
            {item}
            <span className={styles.dot} aria-hidden="true" />
          </span>
        ))}
      </Marquee>
    </div>
  )
}

/** Four figures, counted from the real content. */
export function Numbers() {
  const figures = [
    { value: products.length, label: 'products on one platform' },
    { value: 5, label: 'personas, with access denied by default' },
    { value: permissions.length, label: 'named permissions in the access table' },
    { value: 10, label: 'minutes a platform token lives', suffix: ' min' },
  ]
  return (
    <>
      <section className={`st-wrap st-section ${styles.numbers}`} aria-label="The platform in numbers">
        <Stagger as="dl" className={styles.grid} interval={0.1} distance={32} duration={0.9}>
          {figures.map((fig) => (
            <div key={fig.label} className={styles.figure}>
              <dd className={styles.value}>
                <CountUp
                  value={fig.value}
                  duration={1.8}
                  {...(fig.suffix ? { suffix: fig.suffix } : {})}
                />
              </dd>
              <dt className={styles.label}>{fig.label}</dt>
            </div>
          ))}
        </Stagger>
      </section>
    </>
  )
}
