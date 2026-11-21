import { SearchIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'

/**
 * What Ask Your Life exposes to the workspace. Stub from the Phase 2 pre-wiring: the real `Routes`,
 * `Providers`, `useTodayItems` and `createDemoFetch` are added in plan task 2.6.
 */
export const productModule: ProductModule = {
  id: 'ask-your-life',
  service: 'ask-your-life',
  title: 'Ask Your Life',
  tagline: 'Search everything you have saved, privately.',
  description: 'One private search across your notes, receipts and documents.',
  accent: 'var(--pp-color-accent)',
  icon: SearchIcon,
  nav: [
    { to: '/', label: 'Search', end: true },
    { to: '/add', label: 'Add content' },
    { to: '/library', label: 'Library' },
  ],
  Routes: () => null,
}
