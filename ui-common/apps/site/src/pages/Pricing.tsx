import { Callout, Section, SectionHeader } from '@platform/ui'
import { Link } from 'react-router-dom'
import { CtaPair } from '../components/CtaPair'
import { PageIntro } from '../components/PageIntro'
import { formatNumber, plans } from '../content/platform'
import { usePageMeta } from '../hooks/usePageMeta'
import styles from './Pricing.module.css'

export function Pricing() {
  usePageMeta({
    title: 'Plans and limits: nothing is charged | My-Trove',
    description:
      'My-Trove has three plans (Free, Pro, Developer) that set request, API key and webhook limits. Billing is simulated: there are no prices and no payments.',
  })

  return (
    <>
      <PageIntro
        eyebrow="Plans"
        title="Plans set limits. Nothing is charged."
        lead="Free, Pro and Developer differ in how many requests you can make and how many API keys and webhooks you can hold. There are no prices, no card form and no invoices, because billing is simulated."
        actions={<CtaPair size="lg" />}
      />

      <Section size="md" aria-labelledby="plans-title">
        <SectionHeader headingId="plans-title" scale="md" title="The three plans" />
        <ul className={styles.plans}>
          {plans.map((plan) => (
            <li key={plan.id} className={styles.plan} data-plan={plan.id}>
              <h3 className={styles.name}>{plan.name}</h3>
              <p className={styles.note}>{plan.note}</p>
              <dl className={styles.facts}>
                <div>
                  <dt>Requests a minute</dt>
                  <dd data-testid={`${plan.id}-minute`}>{formatNumber(plan.requestsPerMinute)}</dd>
                </div>
                <div>
                  <dt>Requests a month</dt>
                  <dd data-testid={`${plan.id}-month`}>{formatNumber(plan.requestsPerMonth)}</dd>
                </div>
                <div>
                  <dt>API keys</dt>
                  <dd data-testid={`${plan.id}-keys`}>{plan.apiKeys}</dd>
                </div>
                <div>
                  <dt>Webhooks</dt>
                  <dd data-testid={`${plan.id}-webhooks`}>{plan.webhooks}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="paper" size="md" aria-labelledby="billing-title">
        <div className={styles.split}>
          <SectionHeader headingId="billing-title" scale="md" title="Billing is simulated" />
          <div className={styles.prose}>
            <Callout variant="note" title="No payments, anywhere">
              There is no payment provider, no card form and no invoice. A plan is a set of limits
              stored in the platform and enforced by the gateway. Family Treasury is bookkeeping and
              moves no money either.
            </Callout>
            <p>
              An owner can switch a user’s plan in the admin console to watch the limits change.
              That is the whole of billing: it exists so the quota and rate-limit machinery has
              something real to enforce.
            </p>
          </div>
        </div>
      </Section>

      <Section size="md" aria-labelledby="limits-title">
        <div className={styles.split}>
          <SectionHeader headingId="limits-title" scale="md" title="When you reach a limit" />
          <div className={styles.prose}>
            <p>
              The per-minute limit is a token bucket in the gateway. Go over it, or over the monthly
              quota, and the call is refused with a 429, a Retry-After header, the limit and what
              remains, and a problem body that says which limit was hit.
            </p>
            <p>
              The per-minute limit lives in the memory of one gateway process, which is right for a
              single instance. Running several would need a shared store, and that is not built.
            </p>
            <p>
              API key and webhook limits are stored with each plan. The developer portal that
              creates keys and webhooks is not built yet, so those two limits are not enforced by
              anything today. <Link to="/platform">See what is still to come</Link>.
            </p>
          </div>
        </div>
      </Section>
    </>
  )
}
