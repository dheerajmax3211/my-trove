import { isApiError } from '@platform/api-client'
import { Badge, BentoCard, BentoGrid, Callout } from '@platform/ui'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { useWorkspace } from '../workspace/context'
import { useDocsIndex } from './hooks'
import { KEY_ROUTES } from './routes'
import styles from './Developer.module.css'

/** Which API documents are published, how to make a first request, and what an API key may call. */
export function ApiDocs() {
  usePageTitle('API docs')
  const { runtime } = useWorkspace()
  const docs = useDocsIndex()
  const origin = new URL(runtime.apiBase).origin
  const services = docs.data?.services ?? []
  const published = services.filter((service) => service.available)

  return (
    <BentoGrid>
      <BentoCard span={7} title="Published API documents">
        {docs.isPending ? (
          <p className={styles.muted}>Loading the index.</p>
        ) : docs.isError ? (
          <Callout variant="danger" title="We could not load the index">
            {isApiError(docs.error) ? docs.error.title : 'Check your connection and try again.'}
          </Callout>
        ) : (
          <>
            <p className={styles.muted}>
              Only{' '}
              {published.length === 1
                ? 'one service publishes'
                : `${published.length} services publish`}{' '}
              an API document today. The others are listed so you can see what is coming. An
              unpublished document is not a broken link, it is not written yet.
            </p>
            <ul className={styles.list} aria-label="API documents">
              {services.map((service) => (
                <li key={service.name} className={styles.listItem}>
                  <span>
                    <code>{service.name}</code>
                  </span>
                  {service.available ? (
                    runtime.mode === 'live' ? (
                      <a href={`${origin}${service.docsPath}`}>Open the OpenAPI document</a>
                    ) : (
                      <span className={styles.muted}>Available in the live console</span>
                    )
                  ) : (
                    <Badge variant="neutral">Not published yet</Badge>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </BentoCard>

      <BentoCard span={5} title="Routes open to API keys">
        <p className={styles.muted}>
          A key reaches only the routes listed here, and only with the permission each route needs.
          Everything else is refused, whatever the key holds.
        </p>
        <ul className={styles.list} aria-label="Routes open to API keys">
          {KEY_ROUTES.map((route) => (
            <li key={`${route.method} ${route.path}`}>
              <code>
                {route.method} {route.path}
              </code>{' '}
              needs <code>{route.permission}</code>
            </li>
          ))}
        </ul>
      </BentoCard>

      <BentoCard span={12} title="Your first request">
        <p className={styles.muted}>
          Replace the placeholder with a key you copied when you issued it. The key is the only
          credential the call needs.
        </p>
        <pre
          className={styles.code}
          aria-label="First request"
        >{`curl "${runtime.apiBase}/platform/v1/usage/me" \\
  -H "Authorization: Bearer pk_xxxxxxxx_your_key"`}</pre>
        <p className={styles.muted}>
          It answers with your own usage, the same numbers the overview shows. You can try it on the{' '}
          <Link to="/developer/playground">Playground</Link> page first.
        </p>
      </BentoCard>
    </BentoGrid>
  )
}
