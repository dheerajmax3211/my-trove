import { Badge, type BadgeVariant } from '@platform/ui'
import type { Sensitivity } from '../api/types'

const VARIANT: Record<Sensitivity, BadgeVariant> = {
  PUBLIC: 'neutral',
  PERSONAL: 'info',
  SENSITIVE: 'warning',
  RESTRICTED: 'danger',
}

export const SENSITIVITY_HELP: Record<Sensitivity, string> = {
  PUBLIC: 'Safe to share widely',
  PERSONAL: 'Everyday personal details',
  SENSITIVE: 'Health, home address and similar',
  RESTRICTED: 'Highest care: only released when you allow it explicitly',
}

export function SensitivityBadge({ level }: { level: Sensitivity }) {
  return <Badge variant={VARIANT[level]}>{level}</Badge>
}
