import type { AuditEntry, Flag, RoleView } from '../lib/types'

/** Deterministic ids in the shape of the real ones (UUIDs), so lookups and links behave like production. */
export const demoId = (n: number): string =>
  `0190d2a4-7a3e-7c1b-9f2e-${String(n).padStart(12, '0')}`

export interface DemoPerson {
  n: number
  name: string
  email: string
  roles: string[]
  plan: 'FREE' | 'PRO' | 'DEVELOPER'
  suspended?: boolean
  /** Relative share of traffic. */
  weight: number
}

export const DEMO_PEOPLE: readonly DemoPerson[] = [
  {
    n: 1,
    name: 'Maya Ortiz',
    email: 'maya@trove.example',
    roles: ['OWNER', 'MEMBER'],
    plan: 'DEVELOPER',
    weight: 9,
  },
  {
    n: 2,
    name: 'Tomas Reyes',
    email: 'tomas@trove.example',
    roles: ['ADMIN', 'MEMBER'],
    plan: 'PRO',
    weight: 6,
  },
  {
    n: 3,
    name: 'Ines Park',
    email: 'ines@trove.example',
    roles: ['AUDITOR', 'MEMBER'],
    plan: 'FREE',
    weight: 2,
  },
  {
    n: 4,
    name: 'Priya Raman',
    email: 'priya@trove.example',
    roles: ['DEVELOPER', 'MEMBER'],
    plan: 'DEVELOPER',
    weight: 12,
  },
  {
    n: 5,
    name: 'Sam Okafor',
    email: 'sam@trove.example',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 5,
  },
  {
    n: 6,
    name: 'Hannah Lindqvist',
    email: 'hannah@example.com',
    roles: ['MEMBER'],
    plan: 'PRO',
    weight: 8,
  },
  {
    n: 7,
    name: 'Diego Alvarez',
    email: 'diego@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 4,
  },
  {
    n: 8,
    name: 'Mei Tanaka',
    email: 'mei@example.com',
    roles: ['DEVELOPER', 'MEMBER'],
    plan: 'PRO',
    weight: 7,
  },
  {
    n: 9,
    name: 'Oluwaseun Adeyemi',
    email: 'seun@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 3,
  },
  {
    n: 10,
    name: 'Clara Weiss',
    email: 'clara@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 3,
  },
  {
    n: 11,
    name: 'Jonas Berg',
    email: 'jonas@example.com',
    roles: ['MEMBER'],
    plan: 'PRO',
    weight: 5,
  },
  {
    n: 12,
    name: 'Amara Nwosu',
    email: 'amara@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 2,
  },
  {
    n: 13,
    name: 'Luca Ferrari',
    email: 'luca@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 2,
    suspended: true,
  },
  {
    n: 14,
    name: 'Yuki Hayashi',
    email: 'yuki@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 4,
  },
  {
    n: 15,
    name: 'Noor Haddad',
    email: 'noor@example.com',
    roles: ['MEMBER'],
    plan: 'PRO',
    weight: 6,
  },
  {
    n: 16,
    name: 'Elif Demir',
    email: 'elif@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 1,
  },
  {
    n: 17,
    name: 'Ravi Menon',
    email: 'ravi@example.com',
    roles: ['DEVELOPER', 'MEMBER'],
    plan: 'DEVELOPER',
    weight: 10,
  },
  {
    n: 18,
    name: 'Sofia Rossi',
    email: 'sofia@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 2,
  },
  {
    n: 19,
    name: 'Ben Carter',
    email: 'ben@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 1,
  },
  {
    n: 20,
    name: 'Zainab Khan',
    email: 'zainab@example.com',
    roles: ['MEMBER'],
    plan: 'PRO',
    weight: 4,
  },
  {
    n: 21,
    name: 'Felix Novak',
    email: 'felix@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 1,
  },
  {
    n: 22,
    name: 'Grace Mwangi',
    email: 'grace@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 2,
  },
  {
    n: 23,
    name: 'Tariq Aziz',
    email: 'tariq@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 1,
  },
  {
    n: 24,
    name: 'Isabel Costa',
    email: 'isabel@example.com',
    roles: ['MEMBER'],
    plan: 'FREE',
    weight: 3,
  },
]

export const DEMO_ROLES: RoleView[] = [
  {
    name: 'ADMIN',
    description: 'Operator and support: manages users and roles, but cannot grant ADMIN or OWNER',
    permissions: [
      'audit:read',
      'apps:read:all',
      'connections:manage',
      'flags:manage',
      'products:use',
      'roles:assign',
      'support:impersonate',
      'usage:read:all',
      'usage:read:self',
      'users:read',
      'users:write',
    ],
  },
  {
    name: 'AUDITOR',
    description: 'Read-only access to users, usage and the audit log',
    permissions: ['apps:read:all', 'audit:read', 'usage:read:all', 'users:read'],
  },
  {
    name: 'DEVELOPER',
    description: 'Builds on the platform: developer apps, API keys, webhooks, sandbox',
    permissions: [
      'apps:manage',
      'connections:manage',
      'keys:manage',
      'logs:read:own',
      'products:use',
      'sandbox:use',
      'usage:read:self',
      'webhooks:manage',
      'workspaces:manage',
    ],
  },
  {
    name: 'MEMBER',
    description: 'Default role for every signed-in person: use the products',
    permissions: ['connections:manage', 'products:use', 'usage:read:self'],
  },
  {
    name: 'OWNER',
    description: 'Operates the platform: every permission, can grant ADMIN and OWNER',
    permissions: [
      'apps:manage',
      'apps:read:all',
      'audit:read',
      'connections:manage',
      'flags:manage',
      'keys:manage',
      'logs:read:own',
      'plans:manage',
      'products:use',
      'roles:assign',
      'roles:assign:privileged',
      'sandbox:use',
      'support:impersonate',
      'usage:read:all',
      'usage:read:self',
      'users:read',
      'users:write',
      'webhooks:manage',
      'workspaces:manage',
    ],
  },
]

export function seedAudit(now: Date): AuditEntry[] {
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString()
  const entry = (
    i: number,
    minutesAgo: number,
    actor: number,
    action: string,
    target: number,
    detail: Record<string, unknown>,
  ): AuditEntry => ({
    id: `0190d2a4-aaaa-7c1b-9f2e-${String(i).padStart(12, '0')}`,
    at: at(minutesAgo),
    actorId: demoId(actor),
    action,
    targetId: demoId(target),
    detail,
  })
  return [
    entry(1, 22, 1, 'PLAN_CHANGED', 6, { from: 'FREE', to: 'PRO' }),
    entry(2, 95, 2, 'USER_SUSPENDED', 13, {}),
    entry(3, 300, 1, 'ROLE_GRANTED', 17, { role: 'DEVELOPER' }),
    entry(4, 1_440, 1, 'ROLE_GRANTED', 2, { role: 'ADMIN' }),
    entry(5, 2_900, 2, 'ROLE_GRANTED', 3, { role: 'AUDITOR' }),
    entry(6, 4_300, 1, 'PLAN_CHANGED', 4, { from: 'PRO', to: 'DEVELOPER' }),
    entry(7, 8_000, 2, 'ROLE_REVOKED', 8, { role: 'AUDITOR' }),
    entry(8, 11_500, 1, 'ROLE_GRANTED', 4, { role: 'DEVELOPER' }),
  ]
}

export function seedFlags(now: Date): Flag[] {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString()
  return [
    {
      key: 'new-today-feed',
      description: 'The redesigned Today feed on the workspace home.',
      enabled: true,
      rolloutPercent: 40,
      allowedPlans: [],
      allowedRoles: [],
      createdAt: at(120),
      updatedAt: at(5),
      updatedBy: demoId(1),
    },
    {
      key: 'compact-tables',
      description: 'Denser tables in the admin console.',
      enabled: true,
      rolloutPercent: 100,
      allowedPlans: ['DEVELOPER'],
      allowedRoles: ['DEVELOPER'],
      createdAt: at(400),
      updatedAt: at(72),
      updatedBy: demoId(2),
    },
    {
      key: 'ask-your-life-beta',
      description: 'Early access to changes in Ask Your Life.',
      enabled: false,
      rolloutPercent: 10,
      allowedPlans: ['PRO', 'DEVELOPER'],
      allowedRoles: [],
      createdAt: at(30),
      updatedAt: at(30),
      updatedBy: demoId(1),
    },
  ]
}
