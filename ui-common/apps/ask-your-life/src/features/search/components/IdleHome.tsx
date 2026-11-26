import { Button, Callout } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { SourceBadge, StatusBadge } from '../../../components/Badges'
import type { DocumentResponse } from '../../documents/api/types'
import { formatDate } from '../../documents/lib/labels'

/**
 * What the home shows before a search: the person's own recent questions, what they added lately
 * (with its indexing state), and three habits that make searches better.
 */
export function IdleHome({
  recent,
  documents,
  onPick,
  onClearRecent,
}: {
  recent: readonly string[]
  documents: readonly DocumentResponse[]
  onPick: (query: string) => void
  onClearRecent: () => void
}) {
  const pending = documents.filter((d) => d.status === 'PENDING').length
  return (
    <div className="ayl-idle">
      <div className="ayl-idle-columns">
        <section aria-labelledby="recent-searches-heading" className="ayl-idle-panel">
          <div className="ayl-idle-head">
            <h2 id="recent-searches-heading" className="ayl-h2">
              Recent searches
            </h2>
            {recent.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={onClearRecent}>
                Clear
              </Button>
            ) : null}
          </div>
          {recent.length > 0 ? (
            <ul className="ayl-recent">
              {recent.map((query) => (
                <li key={query}>
                  <button type="button" className="ayl-recent-item" onClick={() => onPick(query)}>
                    {query}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ayl-muted">
              Your searches show up here, on this device only, so you can run them again.
            </p>
          )}
        </section>
        <section aria-labelledby="recent-added-heading" className="ayl-idle-panel">
          <div className="ayl-idle-head">
            <h2 id="recent-added-heading" className="ayl-h2">
              Recently added
            </h2>
            <ModuleLink className="ayl-link" to="/add">
              Add something new
            </ModuleLink>
          </div>
          <ul className="ayl-recent-docs">
            {documents.map((doc) => (
              <li key={doc.id} className="ayl-recent-doc">
                <ModuleLink
                  className="ayl-doc-link"
                  to={{ pathname: '/library', search: `?open=${encodeURIComponent(doc.id)}` }}
                >
                  {doc.title}
                </ModuleLink>
                <span className="ayl-doc-meta">
                  <SourceBadge type={doc.sourceType} />
                  <StatusBadge status={doc.status} />
                  <time dateTime={doc.createdAt}>{formatDate(doc.createdAt)}</time>
                </span>
              </li>
            ))}
          </ul>
          {pending > 0 ? (
            <Callout variant="info" role="status">
              {pending === 1
                ? '1 item is still being indexed. Search cannot find it yet.'
                : `${pending} items are still being indexed. Search cannot find them yet.`}
            </Callout>
          ) : null}
        </section>
      </div>
      <ul className="ayl-tips" aria-label="Search tips">
        <li>Wrap words in &quot;quotes&quot; to match an exact phrase.</li>
        <li>Put - in front of a word to leave it out.</li>
        <li>
          Not sure of the exact words? Hybrid and Semantic also find passages with a similar
          meaning, even when they use other words.
        </li>
      </ul>
    </div>
  )
}
