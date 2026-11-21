import { PlusIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'

/**
 * What Family Treasury exposes to the workspace. Stub from the Phase 2 pre-wiring: the real `Routes`,
 * `Providers`, `useTodayItems` and `createDemoFetch` are added in plan task 2.6.
 */
export const productModule: ProductModule = {
  id: 'family-treasury',
  service: 'family-treasury',
  title: 'Family Treasury',
  tagline: 'Keep the household ledger, approvals and allowances in one place.',
  description:
    'A double-entry household ledger with approvals, allowances and statements. Bookkeeping only.',
  accent: 'var(--pp-color-accent)',
  icon: PlusIcon,
  nav: [{ to: '/', label: 'Dashboard', end: true }],
  Routes: () => null,
}
