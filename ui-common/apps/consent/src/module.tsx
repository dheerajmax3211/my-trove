import { CheckCircleIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'

/**
 * What Consent exposes to the workspace. Stub from the Phase 2 pre-wiring: the real `Routes`,
 * `Providers`, `useTodayItems` and `createDemoFetch` are added in plan task 2.6.
 */
export const productModule: ProductModule = {
  id: 'consent',
  service: 'consent',
  title: 'Consent',
  tagline: 'Decide who can read which part of your data, and take it back any time.',
  description:
    'A vault of your own facts, with scoped, revocable access for apps and a tamper-evident log.',
  accent: 'var(--pp-color-accent)',
  icon: CheckCircleIcon,
  nav: [
    { to: '/', label: 'Overview', end: true },
    { to: '/requests', label: 'Requests' },
    { to: '/grants', label: 'Grants' },
    { to: '/vault', label: 'Vault' },
    { to: '/clients', label: 'Apps' },
    { to: '/history', label: 'History' },
    { to: '/audit', label: 'Audit' },
  ],
  Routes: () => null,
}
