import { Badge } from '@platform/ui'
import type { DocumentStatus, SourceType } from '../features/documents/api/types'
import { SOURCE_LABELS, STATUS_INFO } from '../features/documents/lib/labels'

export function SourceBadge({ type }: { type: SourceType }) {
  return <Badge variant="neutral">{SOURCE_LABELS[type]}</Badge>
}

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const info = STATUS_INFO[status]
  return (
    <Badge variant={info.variant} dot>
      {info.label}
    </Badge>
  )
}
