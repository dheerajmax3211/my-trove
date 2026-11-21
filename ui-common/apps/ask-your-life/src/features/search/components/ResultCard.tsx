import { VisuallyHidden } from '@platform/ui'
import { Link } from 'react-router-dom'
import { Snippet } from '../../../components/Snippet'
import { SourceBadge } from '../../../components/Badges'
import { formatDate } from '../../documents/lib/labels'
import type { SearchDebug, SearchHit, SearchMode } from '../api/types'
import { WhyDialog } from './WhyDialog'

export function ResultCard({
  hit,
  mode,
  debug,
}: {
  hit: SearchHit
  mode: SearchMode
  debug: SearchDebug | null | undefined
}) {
  return (
    <li className="ayl-result">
      <article aria-labelledby={`result-${hit.chunkId}`}>
        <h3 id={`result-${hit.chunkId}`} className="ayl-result-title">
          {hit.title}
        </h3>
        <div className="ayl-result-meta">
          <SourceBadge type={hit.sourceType} />
          <time dateTime={hit.createdAt}>{formatDate(hit.createdAt)}</time>
        </div>
        <Snippet snippet={hit.snippet} className="ayl-snippet" />
        <div className="ayl-result-actions">
          <WhyDialog hit={hit} mode={mode} debug={debug} />
          <Link className="ayl-link" to={`/library?open=${encodeURIComponent(hit.documentId)}`}>
            Open in library
            <VisuallyHidden>: {hit.title}</VisuallyHidden>
          </Link>
        </div>
      </article>
    </li>
  )
}
