/** What the console knows about the platform's fixed vocabulary: permissions, personas, plans. */

export const PERMISSIONS = {
  usageReadAll: 'usage:read:all',
  usageReadSelf: 'usage:read:self',
  usersRead: 'users:read',
  usersWrite: 'users:write',
  rolesAssign: 'roles:assign',
  rolesAssignPrivileged: 'roles:assign:privileged',
  plansManage: 'plans:manage',
  flagsManage: 'flags:manage',
  auditRead: 'audit:read',
} as const

export const PERSONA_ORDER = ['OWNER', 'ADMIN', 'DEVELOPER', 'AUDITOR', 'MEMBER'] as const

/** Roles only an OWNER (`roles:assign:privileged`) may grant, revoke or touch. */
export const PRIVILEGED_ROLES: readonly string[] = ['OWNER', 'ADMIN']

export const PLAN_NAMES = ['FREE', 'PRO', 'DEVELOPER'] as const

/** Fixed plan limits (plans are internal to the platform; there is no public plans endpoint). */
export const PLAN_TABLE = [
  {
    plan: 'FREE',
    blurb: 'Where everyone starts.',
    requestsPerMinute: 120,
    requestsPerMonth: 10_000,
  },
  {
    plan: 'PRO',
    blurb: 'For heavier personal use.',
    requestsPerMinute: 600,
    requestsPerMonth: 200_000,
  },
  {
    plan: 'DEVELOPER',
    blurb: 'For people building on the platform.',
    requestsPerMinute: 1200,
    requestsPerMonth: 1_000_000,
  },
] as const

export interface PermissionInfo {
  area: string
  description: string
}

/** The permission catalogue (auth.permissions) grouped by area. */
export const PERMISSION_CATALOGUE: Record<string, PermissionInfo> = {
  'products:use': { area: 'Products', description: 'Use the six first-party products' },
  'connections:manage': { area: 'Products', description: 'Manage own connected apps' },
  'usage:read:self': { area: 'Usage', description: 'Read own API usage' },
  'usage:read:all': { area: 'Usage', description: 'Read platform-wide usage analytics' },
  'users:read': { area: 'People', description: 'Read users' },
  'users:write': { area: 'People', description: 'Suspend and restore users' },
  'roles:assign': { area: 'People', description: 'Assign and revoke non-privileged roles' },
  'roles:assign:privileged': { area: 'People', description: 'Assign and revoke ADMIN and OWNER' },
  'plans:manage': { area: 'Platform', description: 'Change user plans' },
  'flags:manage': { area: 'Platform', description: 'Manage feature flags' },
  'audit:read': { area: 'Platform', description: 'Read the audit log' },
  'support:impersonate': {
    area: 'Platform',
    description: 'Start a time-boxed support impersonation session',
  },
  'apps:manage': { area: 'Developer', description: 'Manage own developer apps' },
  'apps:read:all': { area: 'Developer', description: 'Read every developer app' },
  'keys:manage': { area: 'Developer', description: 'Manage own API keys' },
  'webhooks:manage': { area: 'Developer', description: 'Manage own webhooks' },
  'sandbox:use': { area: 'Developer', description: 'Use the developer sandbox' },
  'logs:read:own': { area: 'Developer', description: 'Read own request logs' },
  'workspaces:manage': { area: 'Developer', description: 'Manage own workspaces' },
}

export const AREA_ORDER = ['Products', 'Usage', 'People', 'Platform', 'Developer', 'Other']

export function permissionArea(permission: string): string {
  return PERMISSION_CATALOGUE[permission]?.area ?? 'Other'
}

export const FLAG_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/

export const ACTION_LABELS: Record<string, string> = {
  ROLE_GRANTED: 'Role granted',
  ROLE_REVOKED: 'Role revoked',
  USER_SUSPENDED: 'User suspended',
  USER_RESTORED: 'User restored',
  PLAN_CHANGED: 'Plan changed',
}
