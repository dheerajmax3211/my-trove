import {
  Callout,
  CheckIcon,
  Illustration,
  PersonaBadge,
  Section,
  SectionHeader,
} from '@platform/ui'
import { Link } from 'react-router-dom'
import { Steps } from '../components/Blocks'
import { CtaPair } from '../components/CtaPair'
import { PageIntro } from '../components/PageIntro'
import {
  formatNumber,
  permissions,
  personaOrder,
  personaSummaries,
  plans,
  rolePermissions,
} from '../content/platform'
import { ArchitectureDiagram } from '../diagrams/ArchitectureDiagram'
import { usePageMeta } from '../hooks/usePageMeta'
import styles from './Platform.module.css'

const journey = [
  {
    title: 'A credential arrives',
    text: 'A Firebase sign-in from the workspace, or the access token of an app you approved.',
  },
  {
    title: 'It is swapped for a platform token',
    text: 'Signed with RS256, valid for ten minutes, carrying your roles, permissions and plan. The swap is cached for a minute.',
  },
  {
    title: 'Permission and plan are checked',
    text: 'No permission, no request. Over the plan’s limit, you get a 429 with a Retry-After header.',
  },
  {
    title: 'The product answers, and the call is counted',
    text: 'The service verifies the platform token itself. The gateway publishes a usage event without slowing the response.',
  },
]

const metered = [
  'Who called: a user, an app, or nobody signed in',
  'Which product and which route pattern (never the raw address, so ids stay out of analytics)',
  'The status, the time it took and the bytes in and out',
  'Which plan applied, and whether the call was rate limited',
]

export function Platform() {
  usePageMeta({
    title: 'The platform: one gateway, five personas, metered usage | My-Trove',
    description:
      'How My-Trove works as a platform: a single gateway, short-lived platform tokens, five personas with explicit permissions, usage metering, plans and scoped consent for third-party apps.',
  })

  return (
    <>
      <PageIntro
        eyebrow="Platform"
        title="One front door for all six products"
        lead="Every request passes one gateway that works out who is calling, what they may do and which plan they are on. The products stay simple because that is settled before they see the call."
        actions={<CtaPair size="lg" />}
      />

      <Section size="md" aria-labelledby="journey-title">
        <SectionHeader
          headingId="journey-title"
          scale="md"
          title="What happens to a request"
          description="The same four steps for every call, whichever product it is for."
        />
        <div className={styles.block}>
          <Steps items={journey} />
        </div>
        <div
          className={styles.diagram}
          role="region"
          aria-label="Architecture diagram"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          <ArchitectureDiagram />
        </div>
        <p className={styles.hint}>
          On a narrow screen the diagram scrolls sideways. The dashed box is the one part that is
          not built yet.
        </p>
      </Section>

      <Section tone="paper" size="md" aria-labelledby="personas-title">
        <SectionHeader
          headingId="personas-title"
          scale="md"
          title="Five personas, one table of permissions"
          description="Access is deny by default. Each persona holds a fixed set of named permissions, and the services check them, not just the interface."
        />
        <ul className={styles.personaList} aria-label="What each persona is for">
          {personaOrder.map((persona) => (
            <li key={persona} className={styles.personaItem}>
              <PersonaBadge persona={persona} />
              <span>{personaSummaries[persona]}</span>
            </li>
          ))}
        </ul>
        <div
          className={styles.tableWrap}
          role="region"
          aria-label="Permissions by persona"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          <table className={styles.matrix}>
            <caption className={styles.caption}>
              Which permissions each persona holds. A tick means yes; a dash means no.
            </caption>
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {personaOrder.map((persona) => (
                  <th key={persona} scope="col" className={styles.center}>
                    <PersonaBadge persona={persona} size="sm" hideIcon />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => (
                <tr key={permission.id}>
                  <th scope="row">
                    <code className={styles.code}>{permission.id}</code>
                    <span className={styles.meaning}>
                      {permission.meaning}
                      {'later' in permission && permission.later
                        ? ', arrives with a later release'
                        : ''}
                    </span>
                  </th>
                  {personaOrder.map((persona) => {
                    const held = rolePermissions[persona].includes(permission.id)
                    return (
                      <td key={persona} className={styles.center}>
                        {held ? (
                          <>
                            <CheckIcon size={18} className={styles.yes} />
                            <span className={styles.sr}>Yes</span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true" className={styles.no}>
                              -
                            </span>
                            <span className={styles.sr}>No</span>
                          </>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.block}>
          <Callout variant="note" title="Guardrails that are enforced">
            An Admin cannot grant Admin or Owner, or touch anyone who holds either. The last active
            Owner cannot be removed or suspended. Every role change is written to an audit table.
            Support impersonation (the last row) is reserved in the design and not built.
          </Callout>
        </div>
      </Section>

      <Section size="md" aria-labelledby="metering-title">
        <div className={styles.split}>
          <div className={styles.splitText}>
            <SectionHeader
              headingId="metering-title"
              scale="md"
              title="Every call is metered"
              description="Usage is how plans are enforced and how an owner sees what the platform is doing."
            />
            <ul className={styles.metered}>
              {metered.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className={styles.body}>
              The events travel through Kafka into a time-series table with one-minute, hourly and
              daily rollups. An owner sees totals, error rate, p50 and p95 latency, active users and
              a per-product breakdown. A member sees their own usage.
            </p>
          </div>
          <div className={styles.plansBox}>
            <h3 className={styles.plansTitle}>Plans set the ceiling</h3>
            <ul className={styles.planLines}>
              {plans.map((plan) => (
                <li key={plan.id}>
                  <span>{plan.name}</span>
                  <span className={styles.num}>
                    {formatNumber(plan.requestsPerMinute)} a minute
                  </span>
                </li>
              ))}
            </ul>
            <p>
              <Link to="/pricing">All the limits, and why billing is simulated</Link>
            </p>
          </div>
        </div>
      </Section>

      <Section tone="sunken" size="md" aria-labelledby="consent-title">
        <div className={styles.split}>
          <div className={styles.splitText}>
            <SectionHeader
              headingId="consent-title"
              scale="md"
              title="Apps ask before they read"
              description="A third-party app gets no standing access. It asks for named scopes, for a stated purpose and a limited time, and you decide."
            />
            <p className={styles.body}>
              This is the Consent product, and it is the platform’s answer to “my data, your app”.
              Tokens last minutes, every read is re-checked against the live grant, and revoking
              ends access on the next read. An app can hold a valid token and still be refused.
            </p>
            <p>
              <Link to="/products/consent">See how Consent works</Link>
            </p>
          </div>
          <div className={styles.art}>
            <Illustration name="key" size={280} />
          </div>
        </div>
      </Section>

      <Section size="md" aria-labelledby="later-title">
        <SectionHeader
          headingId="later-title"
          scale="md"
          title="What is still to come"
          description="The developer portal is the next piece: registering apps, API keys, signed webhooks, an API reference, an SDK and a sandbox. The permissions and plan limits for it are already defined, which is why they appear on this page, but nothing in the workspace uses them yet."
        />
      </Section>
    </>
  )
}
