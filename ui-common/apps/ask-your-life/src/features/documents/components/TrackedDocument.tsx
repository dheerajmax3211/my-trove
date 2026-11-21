import { ApiError } from '@platform/api-client'
import { Button, Skeleton } from '@platform/ui'
import { Link } from 'react-router-dom'
import { SourceBadge, StatusBadge } from '../../../components/Badges'
import { useDocument } from '../hooks/useDocuments'
import type { DocumentResponse, IngestOutcome } from '../api/types'
import { STATUS_INFO } from '../lib/labels'
import { IngestProgress } from './IngestProgress'

export interface TrackedItem {
  /** Unique per submission (the same document can be submitted twice). */
  key: string
  outcome: IngestOutcome
  document: DocumentResponse
}

const OUTCOME_NOTE: Record<IngestOutcome, string | null> = {
  CREATED: null,
  UPDATED: 'Updated. The earlier version stays searchable until the new one has been indexed.',
  DUPLICATE:
    'Already in your library: you added identical content before, so nothing new was saved.',
}

/** A document just added, kept up to date until it is searchable (or has failed). */
export function TrackedDocument({ item }: { item: TrackedItem }) {
  const query = useDocument(item.document.id)
  // Until the first poll answers, trust what the add request returned.
  const document = query.data ?? item.document
  const note = OUTCOME_NOTE[item.outcome]
  const gone = query.error instanceof ApiError && query.error.status === 404

  return (
    <li className="ayl-tracked">
      <div className="ayl-tracked-head">
        <h3 className="ayl-tracked-title">{document.title}</h3>
        <SourceBadge type={document.sourceType} />
        <StatusBadge status={document.status} />
      </div>
      {gone ? (
        <p className="ayl-muted">This document has since been deleted.</p>
      ) : (
        <>
          <IngestProgress status={document.status} />
          <p role="status" className="ayl-tracked-status">
            {note ? `${note} ` : ''}
            {STATUS_INFO[document.status].description}
          </p>
        </>
      )}
      <div className="ayl-tracked-actions">
        {document.status === 'INDEXED' && !gone ? (
          <Button asChild size="sm">
            <Link to={`/?q=${encodeURIComponent(document.title)}`}>Search for it</Link>
          </Button>
        ) : null}
        {!gone ? (
          <Button asChild size="sm" variant="secondary">
            <Link to={`/library?open=${encodeURIComponent(document.id)}`}>View in library</Link>
          </Button>
        ) : null}
        {query.isPending && !query.data ? <Skeleton width="4rem" height="1rem" /> : null}
      </div>
    </li>
  )
}
