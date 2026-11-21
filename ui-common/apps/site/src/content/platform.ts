import type { Persona } from '@platform/ui'

/**
 * Plan limits. These are the values the gateway enforces (`platform.plans`), restated here so the
 * site can show them. A test pins them to the numbers in the design document.
 */
export interface PlanContent {
  id: 'FREE' | 'PRO' | 'DEVELOPER'
  name: string
  requestsPerMinute: number
  requestsPerMonth: number
  apiKeys: number
  webhooks: number
  note: string
}

export const plans: readonly PlanContent[] = [
  {
    id: 'FREE',
    name: 'Free',
    requestsPerMinute: 120,
    requestsPerMonth: 10_000,
    apiKeys: 3,
    webhooks: 1,
    note: 'Enough to use every product by hand.',
  },
  {
    id: 'PRO',
    name: 'Pro',
    requestsPerMinute: 600,
    requestsPerMonth: 200_000,
    apiKeys: 10,
    webhooks: 5,
    note: 'Headroom for sensors that report all day and scripts that call often.',
  },
  {
    id: 'DEVELOPER',
    name: 'Developer',
    requestsPerMinute: 1_200,
    requestsPerMonth: 1_000_000,
    apiKeys: 50,
    webhooks: 20,
    note: 'For building apps on the platform.',
  },
]

export const formatNumber = (n: number): string => n.toLocaleString('en-US')

/** The permissions of the design document (section 5.2), in the order the table shows them. */
export const permissions = [
  { id: 'products:use', meaning: 'Use the six products' },
  { id: 'usage:read:self', meaning: 'See your own usage' },
  { id: 'connections:manage', meaning: 'See and revoke the apps you connected' },
  { id: 'apps:manage', meaning: 'Register your own developer apps', later: true },
  { id: 'keys:manage', meaning: 'Create and revoke API keys', later: true },
  { id: 'webhooks:manage', meaning: 'Manage webhooks', later: true },
  { id: 'sandbox:use', meaning: 'Use the sandbox', later: true },
  { id: 'logs:read:own', meaning: 'Read your own request logs', later: true },
  { id: 'workspaces:manage', meaning: 'Manage developer workspaces', later: true },
  { id: 'users:read', meaning: 'List users' },
  { id: 'users:write', meaning: 'Suspend and restore users' },
  { id: 'roles:assign', meaning: 'Assign and revoke roles other than Admin and Owner' },
  { id: 'roles:assign:privileged', meaning: 'Grant or change Admin and Owner' },
  { id: 'usage:read:all', meaning: 'See usage across every user' },
  { id: 'plans:manage', meaning: 'Change a user’s plan' },
  { id: 'flags:manage', meaning: 'Manage feature flags' },
  { id: 'audit:read', meaning: 'Read the audit log of role changes' },
  { id: 'apps:read:all', meaning: 'See every developer app', later: true },
  { id: 'support:impersonate', meaning: 'View as a user for support', later: true },
] as const

export type PermissionId = (typeof permissions)[number]['id']

const MEMBER: readonly PermissionId[] = ['products:use', 'usage:read:self', 'connections:manage']

export const rolePermissions: Record<Persona, readonly PermissionId[]> = {
  MEMBER,
  DEVELOPER: [
    ...MEMBER,
    'apps:manage',
    'keys:manage',
    'webhooks:manage',
    'sandbox:use',
    'logs:read:own',
    'workspaces:manage',
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
  ],
  OWNER: permissions.map((p) => p.id),
}

export const personaSummaries: Record<Persona, string> = {
  MEMBER: 'Everyone starts here. Uses the products and sees their own usage.',
  DEVELOPER: 'A member who builds apps on the platform.',
  AUDITOR: 'Reads usage, users and the audit log. Cannot change anything.',
  ADMIN: 'Runs the platform day to day. Cannot grant Admin or Owner, or touch either.',
  OWNER: 'Holds every permission, including granting Admin and changing plans.',
}

/** Column order in the table. */
export const personaOrder: readonly Persona[] = ['MEMBER', 'DEVELOPER', 'AUDITOR', 'ADMIN', 'OWNER']
