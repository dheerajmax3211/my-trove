import { Callout, CountUp, Stagger } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { Screen } from '../components/common'
import shared from '../components/shared.module.css'
import { PERMISSIONS, PLAN_TABLE } from '../lib/catalogue'
import { formatInt } from '../lib/format'
import styles from './Plans.module.css'

const TOP_MINUTE = Math.max(...PLAN_TABLE.map((p) => p.requestsPerMinute))
const TOP_MONTH = Math.max(...PLAN_TABLE.map((p) => p.requestsPerMonth))

export function PlansScreen() {
  return (
    <Screen
      title="Plans"
      area="Plans"
      permission={PERMISSIONS.usageReadAll}
      description="The three plans and the limits the gateway applies to each."
    >
      <div className={shared.stack}>
        <Stagger
          as="ul"
          className={styles.cards}
          aria-label="Plans and their limits"
          interval={0.08}
        >
          {PLAN_TABLE.map((p, i) => (
            <li
              key={p.plan}
              className={`${styles.card} ${i === PLAN_TABLE.length - 1 ? styles.top : ''}`}
              {...(i === PLAN_TABLE.length - 1 ? { 'data-surface': 'vault' } : {})}
            >
              <h2 className={styles.name}>{p.plan}</h2>
              <p className={styles.blurb}>{p.blurb}</p>
              <p className={styles.figure}>
                <CountUp value={p.requestsPerMinute} />
                <span className={styles.unit}>requests per minute</span>
              </p>
              <span className={styles.meter} aria-hidden="true">
                <span style={{ width: `${(p.requestsPerMinute / TOP_MINUTE) * 100}%` }} />
              </span>
              <dl className={styles.month}>
                <dt>Requests per month</dt>
                <dd>{formatInt(p.requestsPerMonth)}</dd>
              </dl>
              <span className={styles.meter} aria-hidden="true">
                <span style={{ width: `${(p.requestsPerMonth / TOP_MONTH) * 100}%` }} />
              </span>
            </li>
          ))}
        </Stagger>
        <Callout variant="note" title="Billing is simulated">
          A plan sets how many requests a person can make; it does not charge anyone and no payment
          details are collected. The limits above are fixed in the platform and are not editable
          here. To move someone to a different plan, open them from{' '}
          <ModuleLink to="/users" className={shared.link}>
            Users
          </ModuleLink>{' '}
          (owners only).
        </Callout>
      </div>
    </Screen>
  )
}
