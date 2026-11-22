import { Badge, VisuallyHidden } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { Snippet } from '../../../components/Snippet'
import { SourceBadge } from '../../../components/Badges'
import { formatDate } from '../../documents/lib/labels'
import type { SearchDebug, SearchHit, SearchMode } from '../api/types'
import { WhyDialog } from './WhyDialog'

/** How the passage was found, from the ranks the service reports. Empty when it reports none. */
function matchedBy(hit: SearchHit, mode: SearchMode): string[] {
  const keyword = mode !== 'semantic' && hit.explain?.ftsRank != null
  const meaning = mode !== 'keyword' && hit.explain?.semanticRank != null
  return [
    ...(keyword ? ['Has your words'] : []),
    ...(meaning ? ['Similar wording (stand-in)'] : []),
  ]
}

export function ResultCard({
  hit,
  mode,
  debug,
}: {
  hit: SearchHit
  mode: SearchMode
  debug: SearchDebug | null | undefined
}) {
  const matched = matchedBy(hit, mode)
  return (
    <li className="ayl-result">
      <article aria-labelledby={`result-${hit.chunkId}`}>
        <h3 id={`result-${hit.chunkId}`} className="ayl-result-title">
          {hit.title}
        </h3>
        <div className="ayl-result-meta">
          <SourceBadge type={hit.sourceType} />
          <time dateTime={hit.createdAt}>{formatDate(hit.createdAt)}</time>
          <span>Passage {hit.chunkOrdinal + 1}</span>
        </div>
        <Snippet snippet={hit.snippet} className="ayl-snippet" />
        <div className="ayl-result-actions">
          {matched.map((label) => (
            <Badge key={label} variant="accent">
              {label}
            </Badge>
          ))}
          <WhyDialog hit={hit} mode={mode} debug={debug} />
          <ModuleLink
            className="ayl-link"
            to={{ pathname: '/library', search: `?open=${encodeURIComponent(hit.documentId)}` }}
          >
            Open in library
            <VisuallyHidden>: {hit.title}</VisuallyHidden>
          </ModuleLink>
        </div>
      </article>
    </li>
  )
}
