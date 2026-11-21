import { Badge, type BadgeVariant } from '@platform/ui'
import type { GrantStatus, RequestStatus } from '../api/types'

const VARIANT: Record<GrantStatus | RequestStatus, BadgeVariant> = {
  ACTIVE: 'success',
  APPROVED: 'success',
  PENDING: 'accent',
  EXPIRED: 'neutral',
  REVOKED: 'danger',
  DENIED: 'danger',
}

const LABEL: Record<GrantStatus | RequestStatus, string> = {
  ACTIVE: 'Active',
  APPROVED: 'Approved',
  PENDING: 'Pending',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
  DENIED: 'Denied',
}

export function StatusBadge({ status }: { status: GrantStatus | RequestStatus }) {
  return (
    <Badge variant={VARIANT[status]} dot>
      {LABEL[status]}
    </Badge>
  )
}
