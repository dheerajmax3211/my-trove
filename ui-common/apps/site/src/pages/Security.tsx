import { Section, SectionHeader } from '@platform/ui'
import { PageIntro } from '../components/PageIntro'
import { repoPath, repoUrl } from '../config'
import { controls, limits } from '../content/security'
import { usePageMeta } from '../hooks/usePageMeta'
import styles from './Security.module.css'

export function Security() {
  usePageMeta({
    title: 'Security: what is protected, and what is not | My-Trove',
    description:
      'What My-Trove actually implements for security (sign-in, permissions, signed tokens, audit logs, encryption, row-level security, rate limits) and the honest limits of a portfolio project.',
  })

  return (
    <>
      <PageIntro
        eyebrow="Security"
        title="What is protected, and what is not"
        lead="The first half of this page lists protections that are built and tested. The second half lists what a careful reviewer would want to know is missing. Both are written plainly."
      />

      <Section size="md" aria-labelledby="built-title">
        <SectionHeader
          headingId="built-title"
          scale="md"
          title="What is built"
          description="Each item names the tests or folders in the repository that exercise it, so you can check the claim rather than take it."
        />
        <ul className={styles.controls}>
          {controls.map((control) => (
            <li key={control.id} id={control.id} className={styles.control}>
              <div className={styles.controlMain}>
                <h3 className={styles.controlTitle}>{control.title}</h3>
                <p>{control.what}</p>
              </div>
              <div className={styles.controlSide}>
                <p className={styles.stops}>{control.detail}</p>
                <ul className={styles.proof} aria-label={`Where to check: ${control.title}`}>
                  {control.proof.map((item) => (
                    <li key={item}>
                      <code>{item}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="sunken" size="md" aria-labelledby="limits-title">
        <SectionHeader
          headingId="limits-title"
          scale="md"
          title="What is not here"
          description="This is a portfolio project. Treat it like one."
        />
        <dl className={styles.limits}>
          {limits.map((limit) => (
            <div key={limit.title} className={styles.limit}>
              <dt>{limit.title}</dt>
              <dd>{limit.text}</dd>
            </div>
          ))}
        </dl>
        <p className={styles.report}>
          Found a problem? The code and its history are public in the{' '}
          <a href={repoUrl()}>repository</a>, and each service README ends with its own list of
          limitations, for example the{' '}
          <a href={repoPath('consent-gateway/README.md')}>Consent README</a>.
        </p>
      </Section>
    </>
  )
}
