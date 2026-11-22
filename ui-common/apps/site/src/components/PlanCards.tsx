import { CountUp, SpotlightCard, Stagger, cx } from '@platform/ui'
import type { CSSProperties } from 'react'
import { plans, type PlanContent } from '../content/platform'
import styles from './PlanCards.module.css'

const tones: Record<PlanContent['id'], string> = {
  FREE: 'var(--pp-color-text-subtle)',
  PRO: 'var(--pp-color-lilac)',
  DEVELOPER: 'var(--pp-color-lime)',
}

function Figure({ value, testId }: { value: number; testId?: string }) {
  return (
    <span data-testid={testId}>
      <CountUp value={value} locale="en-US" duration={1.6} format={{ maximumFractionDigits: 0 }} />
    </span>
  )
}

/**
 * The three plans as lit cards whose limits count up as they arrive. `detailed` adds the API key
 * and webhook limits and the test ids the pricing page uses.
 */
export function PlanCards({ detailed = false }: { detailed?: boolean }) {
  return (
    <Stagger as="ul" className={styles.plans} interval={0.12} distance={36} duration={0.9}>
      {plans.map((plan) => (
        <li key={plan.id} className={styles.item}>
          <SpotlightCard
            tilt={2.5}
            tone={plan.id === 'DEVELOPER' ? 'accent' : plan.id === 'PRO' ? 'lilac' : 'accent'}
            className={styles.card}
            data-plan={plan.id}
            style={{ '--tone': tones[plan.id] } as CSSProperties}
          >
            <h3 className={styles.name}>{plan.name}</h3>
            <p className={styles.note}>{plan.note}</p>
            <p className={styles.big}>
              <Figure
                value={plan.requestsPerMinute}
                {...(detailed ? { testId: `${plan.id}-minute` } : {})}
              />
              <span className={styles.unit}>requests a minute</span>
            </p>
            <dl className={cx(styles.facts, detailed && styles.detailed)}>
              <div>
                <dt>Requests a month</dt>
                <dd>
                  <Figure
                    value={plan.requestsPerMonth}
                    {...(detailed ? { testId: `${plan.id}-month` } : {})}
                  />
                </dd>
              </div>
              {detailed ? (
                <>
                  <div>
                    <dt>API keys</dt>
                    <dd data-testid={`${plan.id}-keys`}>{plan.apiKeys}</dd>
                  </div>
                  <div>
                    <dt>Webhooks</dt>
                    <dd data-testid={`${plan.id}-webhooks`}>{plan.webhooks}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </SpotlightCard>
        </li>
      ))}
    </Stagger>
  )
}
