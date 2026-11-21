import { CheckCircleIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'

/** Stub from the Phase 2 pre-wiring; the real console is plan task 2.4. Each screen gates itself on its own permission. */
export const adminModule: ProductModule = {
  id: 'admin',
  service: 'auth',
  title: 'Admin',
  tagline: 'Run the platform: people, roles, usage and flags.',
  description: 'Users and roles, usage analytics, audit log, feature flags and plans.',
  accent: 'var(--pp-color-accent)',
  icon: CheckCircleIcon,
  nav: [
    { to: '/', label: 'Overview', end: true },
    { to: '/users', label: 'Users', permission: 'users:read' },
    { to: '/roles', label: 'Roles', permission: 'users:read' },
    { to: '/usage', label: 'Usage', permission: 'usage:read:all' },
    { to: '/audit', label: 'Audit', permission: 'audit:read' },
    { to: '/flags', label: 'Flags', permission: 'flags:manage' },
  ],
  Routes: () => null,
}
