import { Badge, type BadgeVariant } from '@platform/ui'
import type { Role } from '../api/types'

const VARIANT: Record<Role, BadgeVariant> = {
  OWNER: 'accent',
  APPROVER: 'info',
  MEMBER: 'neutral',
  KID: 'warning',
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  APPROVER: 'Approver',
  MEMBER: 'Member',
  KID: 'Kid',
}

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={VARIANT[role]}>{ROLE_LABEL[role]}</Badge>
}
