import { InfoIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'

/**
 * What Digital Legacy exposes to the workspace. Stub from the Phase 2 pre-wiring: the real `Routes`,
 * `Providers`, `useTodayItems` and `createDemoFetch` are added in plan task 2.6.
 */
export const productModule: ProductModule = {
  id: 'digital-legacy',
  service: 'digital-legacy',
  title: 'Digital Legacy',
  tagline: 'Plan what the people you trust can open if you are no longer around.',
  description: 'An end-to-end encrypted vault released to trustees only if you stop checking in.',
  accent: 'var(--pp-color-accent)',
  icon: InfoIcon,
  nav: [
    { to: '/', label: 'Overview', end: true },
    { to: '/vault', label: 'Vault' },
    { to: '/trustees', label: 'Trustees' },
    { to: '/policy', label: 'Check-in policy' },
    { to: '/timeline', label: 'Timeline' },
  ],
  Routes: () => null,
}
