import { personas, type Persona } from '@platform/ui'

/** Every permission string the platform defines (design 5.2). OWNER holds all of them. */
export const ALL_PERMISSIONS = [
  'products:use',
  'usage:read:self',
  'connections:manage',
  'apps:manage',
  'keys:manage',
  'webhooks:manage',
  'sandbox:use',
  'logs:read:own',
  'workspaces:manage',
  'mcp:use',
  'usage:read:all',
  'apps:read:all',
  'users:read',
  'users:write',
  'roles:assign',
  'roles:assign:privileged',
  'plans:manage',
  'flags:manage',
  'audit:read',
  'support:impersonate',
] as const

const MEMBER = ['products:use', 'usage:read:self', 'connections:manage']

/** The permissions each persona holds (design 5.2). Used by demo mode and the Account page. */
export const PERSONA_PERMISSIONS: Record<Persona, readonly string[]> = {
  MEMBER,
  DEVELOPER: [
    ...MEMBER,
    'apps:manage',
    'keys:manage',
    'webhooks:manage',
    'sandbox:use',
    'logs:read:own',
    'workspaces:manage',
    'mcp:use',
  ],
  AUDITOR: ['usage:read:all', 'users:read', 'audit:read', 'apps:read:all'],
  ADMIN: [
    ...MEMBER,
    'users:read',
    'users:write',
    'roles:assign',
    'usage:read:all',
    'flags:manage',
    'audit:read',
    'apps:read:all',
    'support:impersonate',
    'mcp:use',
  ],
  OWNER: ALL_PERMISSIONS,
}

/** Which plan the demo gives each persona. */
export const PERSONA_PLAN: Record<Persona, string> = {
  MEMBER: 'FREE',
  DEVELOPER: 'DEVELOPER',
  AUDITOR: 'FREE',
  ADMIN: 'PRO',
  OWNER: 'DEVELOPER',
}

/** Highest first: a user with several roles is shown as the first one that matches. */
const PRECEDENCE: readonly Persona[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'AUDITOR', 'MEMBER']

export function isPersona(value: unknown): value is Persona {
  return typeof value === 'string' && (personas as readonly string[]).includes(value)
}

/** The persona to show in the badge for a set of role names. Unknown roles fall back to MEMBER. */
export function primaryPersona(roles: readonly string[]): Persona {
  const upper = roles.map((role) => role.toUpperCase())
  return PRECEDENCE.find((persona) => upper.includes(persona)) ?? 'MEMBER'
}

export const PERSONA_LABELS: Record<Persona, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  DEVELOPER: 'Developer',
  MEMBER: 'Member',
  AUDITOR: 'Auditor',
}

export const PERSONA_SUMMARY: Record<Persona, string> = {
  OWNER: 'Runs the platform: every permission, including granting Admin and changing plans.',
  ADMIN: 'Operates the platform: people, roles, usage, flags and the audit log.',
  DEVELOPER: 'Builds on the platform: apps, API keys, webhooks and the sandbox.',
  MEMBER: 'Uses the products with their own data.',
  AUDITOR: 'Read-only oversight: usage, people and the audit log.',
}

/** What each permission lets you do, in plain words. Unknown permissions show their raw name. */
export const PERMISSION_LABELS: Record<string, string> = {
  'products:use': 'Use the products',
  'usage:read:self': 'See your own usage',
  'connections:manage': 'Manage apps connected to your data',
  'mcp:use': 'Ask the Trove Assistant and connect AI agents (MCP)',
  'apps:manage': 'Create and manage developer apps',
  'keys:manage': 'Create and revoke API keys',
  'webhooks:manage': 'Manage webhooks',
  'sandbox:use': 'Use the sandbox',
  'logs:read:own': 'Read logs of your own apps',
  'workspaces:manage': 'Manage developer workspaces',
  'usage:read:all': 'See usage across the platform',
  'apps:read:all': 'See every developer app',
  'users:read': 'See people and their roles',
  'users:write': 'Suspend and restore people',
  'roles:assign': 'Assign roles',
  'roles:assign:privileged': 'Grant Admin and Owner',
  'plans:manage': 'Change plans',
  'flags:manage': 'Manage feature flags',
  'audit:read': 'Read the audit log',
  'support:impersonate': 'Start a support session as a user',
}

export interface PermissionGroup {
  title: string
  permissions: readonly string[]
}

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    title: 'Products and your data',
    permissions: ['products:use', 'usage:read:self', 'connections:manage', 'mcp:use'],
  },
  {
    title: 'Developer tools',
    permissions: [
      'apps:manage',
      'keys:manage',
      'webhooks:manage',
      'sandbox:use',
      'logs:read:own',
      'workspaces:manage',
    ],
  },
  {
    title: 'Running the platform',
    permissions: [
      'users:read',
      'users:write',
      'roles:assign',
      'roles:assign:privileged',
      'plans:manage',
      'flags:manage',
      'support:impersonate',
    ],
  },
  { title: 'Oversight', permissions: ['usage:read:all', 'apps:read:all', 'audit:read'] },
]

/** Splits a permission list into the groups above; anything unknown lands in "Other". */
export function groupPermissions(
  permissions: readonly string[],
): { title: string; permissions: string[] }[] {
  const held = new Set(permissions)
  const known = new Set<string>(PERMISSION_GROUPS.flatMap((group) => group.permissions))
  const groups = PERMISSION_GROUPS.map((group) => ({
    title: group.title,
    permissions: group.permissions.filter((permission) => held.has(permission)),
  }))
  const other = permissions.filter((permission) => !known.has(permission)).sort()
  if (other.length > 0) groups.push({ title: 'Other', permissions: other })
  return groups.filter((group) => group.permissions.length > 0)
}

export interface PlanInfo {
  name: string
  perMinute: number
  perMonth: number
}

/** The plan limits from the platform design (Phase 1). */
export const PLANS: Record<string, PlanInfo> = {
  FREE: { name: 'Free', perMinute: 120, perMonth: 10_000 },
  PRO: { name: 'Pro', perMinute: 600, perMonth: 200_000 },
  DEVELOPER: { name: 'Developer', perMinute: 1_200, perMonth: 1_000_000 },
}

export function planInfo(plan: string): PlanInfo | null {
  return PLANS[plan.toUpperCase()] ?? null
}
