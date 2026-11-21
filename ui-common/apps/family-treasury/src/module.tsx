import { CoinsIcon, PlusIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import { createDemoFetch } from './demoFetch'
import { TreasuryRoutes } from './routes'
import { useTodayItems } from './today'
import { ViewerProvider } from './viewer'

/**
 * What Family Treasury exposes to the workspace. The workspace supplies auth, the API client (bound to
 * `<gateway>/api/family-treasury`, paths `/v1/...`), the query cache, theme, toasts and the router.
 *
 * Only the module home and "New household" are static. A household's own sections (Dashboard, Move money, Activity,
 * Approvals, Statements, Allowances, Reconciliation, Members) depend on the household and on your role in it, so they
 * are navigation inside the module's content (`ModuleBar`).
 */
export const productModule: ProductModule = {
  id: 'family-treasury',
  service: 'family-treasury',
  title: 'Family Treasury',
  tagline: 'Keep the household ledger, approvals and allowances in one place.',
  description:
    'A shared household pool with a pot for each person, approvals for big spends, allowances and statements. Bookkeeping only: no real money moves.',
  accent: 'var(--pp-color-accent)',
  icon: CoinsIcon,
  nav: [
    { to: '/', label: 'My household', end: false, icon: CoinsIcon },
    { to: '/welcome', label: 'New household', end: true, icon: PlusIcon },
  ],
  Providers: ViewerProvider,
  Routes: TreasuryRoutes,
  useTodayItems,
  createDemoFetch,
}
