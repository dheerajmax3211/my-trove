import { Badge, type BadgeVariant } from '@platform/ui'
import type { HealthStatus } from '../types'

const STATUS: Record<HealthStatus, { label: string; variant: BadgeVariant }> = {
  HEALTHY: { label: 'Healthy', variant: 'success' },
  WARNING: { label: 'Watch', variant: 'warning' },
  CRITICAL: { label: 'Alert', variant: 'danger' },
  LEARNING: { label: 'Learning', variant: 'info' },
  NO_DEVICE: { label: 'No device', variant: 'neutral' },
}

/** The status word is always shown: colour is a reinforcement, never the only signal. */
export function HealthStatusBadge({ status }: { status: HealthStatus }) {
  const { label, variant } = STATUS[status]
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  )
}
