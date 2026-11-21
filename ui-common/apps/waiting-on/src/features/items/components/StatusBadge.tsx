import { Badge } from '@platform/ui'
import type { ItemStatus } from '../api/types'
import { STATUS_LABEL, STATUS_VARIANT } from '../logic/labels'

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
