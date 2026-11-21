import { Button, Callout, Section, SectionHeader } from '@platform/ui'
import { PageIntro } from '../components/PageIntro'
import { repoPath, repoUrl } from '../config'
import { products } from '../content/products'
import { usePageMeta } from '../hooks/usePageMeta'
import styles from './Docs.module.css'

const readmeFolders: Record<(typeof products)[number]['id'], string> = {
  'waiting-on': 'waiting-on',
  consent: 'consent-gateway',
  'home-pulse': 'home-pulse',
  'ask-your-life': 'ask-your-life',
  'digital-legacy': 'digital-legacy',
  'family-treasury': 'family-treasury',
}

const START = `docker compose -f dev/docker-compose.yml up -d
./mvnw -DskipTests package
dev/up.sh
cd ui-common && pnpm install
pnpm --filter @platform/workspace dev`

export function Docs() {
  usePageMeta({
    title: 'Docs: what exists today and how to run it | My-Trove',
    description:
      'Where the My-Trove documentation lives today (the repository READMEs, the design document and the design language), how to run the stack, and what arrives with the developer portal.',
  })

  return (
    <>
      <PageIntro
        eyebrow="Docs"
        title="Read the code, run the stack"
        lead="The documentation today is the repository itself: one README per service with its endpoints and its honest limits, a design document, and the design language. The API reference and SDK come later."
        actions={
          <Button asChild size="lg">
            <a href={repoUrl()}>Open the repository</a>
          </Button>
        }
      />

      <Section size="md" aria-labelledby="exists-title">
        <SectionHeader
          headingId="exists-title"
          scale="md"
          title="What exists today"
          description="Each product README covers its architecture, every endpoint, configuration, tests and a list of limitations."
        />
        <ul className={styles.links}>
          {products.map((product) => (
            <li key={product.id}>
              <a href={repoPath(`${readmeFolders[product.id]}/README.md`)}>
                <span className={styles.linkTitle}>{product.name}</span>
                <span className={styles.linkText}>{product.tagline}</span>
              </a>
            </li>
          ))}
          <li>
            <a href={repoPath('docs/superpowers/specs/2026-11-21-trove-platform-v2-design.md')}>
              <span className={styles.linkTitle}>Platform design</span>
              <span className={styles.linkText}>Personas, permissions, tokens, usage events</span>
            </a>
          </li>
          <li>
            <a href={repoPath('docs/design/brand.md')}>
              <span className={styles.linkTitle}>Design language</span>
              <span className={styles.linkText}>Palette, type, patterns, components</span>
            </a>
          </li>
          <li>
            <a href={repoPath('dev/README.md')}>
              <span className={styles.linkTitle}>Local stack</span>
              <span className={styles.linkText}>Services, sign-in and what is real</span>
            </a>
          </li>
        </ul>
      </Section>

      <Section tone="paper" size="md" aria-labelledby="run-title">
        <SectionHeader
          headingId="run-title"
          scale="md"
          title="Run it yourself"
          description="You need Docker, Java 21, Node 22 and pnpm. Sign-in uses a local stand-in identity provider, so no Firebase account is needed."
        />
        {/* Focusable so keyboard users can scroll a long line. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <pre className={styles.code} tabIndex={0} aria-label="Commands to start My-Trove">
          <code>{START}</code>
        </pre>
        <p className={styles.after}>
          The workspace opens on port 5190. The demo needs none of this: it runs on sample data in
          your browser.
        </p>
      </Section>

      <Section size="md" aria-labelledby="later-title">
        <SectionHeader headingId="later-title" scale="md" title="What is still to come" />
        <div className={styles.later}>
          <Callout variant="note" title="API reference and SDK">
            The API reference and a generated SDK arrive with the developer portal. Until then, each
            product README lists its endpoints with request and response shapes, and every call goes
            through the gateway at <code>/api/&lt;service&gt;/v1/...</code>.
          </Callout>
        </div>
      </Section>
    </>
  )
}
