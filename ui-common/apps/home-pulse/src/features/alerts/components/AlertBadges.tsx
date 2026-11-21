import { Badge, type BadgeVariant } from '@platform/ui'
import { SEVERITY_LABELS, STATUS_LABELS } from '../evidence'
import type { AlertStatus, Severity } from '../types'

const SEVERITY_VARIANT: Record<Severity, BadgeVariant> = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'danger',
}

const STATUS_VARIANT: Record<AlertStatus, BadgeVariant> = {
  OPEN: 'accent',
  ACKNOWLEDGED: 'neutral',
  RESOLVED: 'success',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge variant={SEVERITY_VARIANT[severity]} dot>
      {SEVERITY_LABELS[severity]}
    </Badge>
  )
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
}
