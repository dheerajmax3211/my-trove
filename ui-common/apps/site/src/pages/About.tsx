import { Button, Section, SectionHeader } from '@platform/ui'
import { CtaPair } from '../components/CtaPair'
import { PageIntro } from '../components/PageIntro'
import { repoUrl } from '../config'
import { usePageMeta } from '../hooks/usePageMeta'
import styles from './About.module.css'

const status = [
  'Every service is a verified first slice, not a finished product. The tests pass against real databases, and the web apps have been driven end to end against the real services.',
  'Notification delivery is log-only, MQTT ingestion is off by default, the search embedder is a deterministic local one, and nothing has run against real devices.',
  'There is no production deployment. The demo runs in your browser on sample data.',
]

export function About() {
  usePageMeta({
    title: 'About: an open portfolio build | My-Trove',
    description:
      'My-Trove is an open portfolio project: six products and a platform layer for the paperwork of life, built in one repository. Why it exists, how it is built and where it stands.',
  })

  return (
    <>
      <PageIntro
        eyebrow="About"
        title="An open portfolio build"
        lead="My-Trove is one developer’s project, built in the open. It is a working answer to a small question and a demonstration of how several hard backend problems are solved properly."
        actions={
          <Button asChild size="lg">
            <a href={repoUrl()}>Read the source</a>
          </Button>
        }
      />

      <Section size="md" aria-labelledby="why-title">
        <div className={styles.split}>
          <SectionHeader headingId="why-title" scale="md" title="Why it exists" />
          <div className={styles.prose}>
            <p>
              The paperwork of life is scattered. Refunds nobody chased, receipts buried in email,
              an appliance that dies a week after its warranty, instructions only one person knows,
              family money in a spreadsheet. My-Trove asks what it would look like if one place held
              all of it, and you, not the apps, decided who saw what.
            </p>
            <p>
              It is also a way to show, in one repository, what it takes to build durable workflows,
              a token issuer, time-series storage, hybrid search, threshold cryptography and a
              double-entry ledger, with a platform layer for identity, permissions, metering and
              plans on top.
            </p>
          </div>
        </div>
      </Section>

      <Section tone="paper" size="md" aria-labelledby="how-title">
        <div className={styles.split}>
          <SectionHeader headingId="how-title" scale="md" title="How it is built" />
          <div className={styles.prose}>
            <p>
              Java 21 and Spring Boot 4 services behind a Spring Cloud gateway, PostgreSQL with
              TimescaleDB and pgvector, Temporal for durable workflows, Kafka for usage events, and
              a React 19 and TypeScript front end in one monorepo that shares a design system. Every
              service has its own README, its own schema and its own honest list of limitations.
            </p>
            <p>
              Fonts are self-hosted, nothing loads from a third-party CDN, and the whole thing runs
              locally at no cost.
            </p>
          </div>
        </div>
      </Section>

      <Section size="md" aria-labelledby="status-title">
        <div className={styles.split}>
          <SectionHeader headingId="status-title" scale="md" title="Where it stands" />
          <ul className={styles.status}>
            {status.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="sunken" size="md" aria-labelledby="try-title">
        <SectionHeader headingId="try-title" scale="md" title="See it for yourself" />
        <div className={styles.actions}>
          <CtaPair size="lg" />
        </div>
      </Section>
    </>
  )
}
