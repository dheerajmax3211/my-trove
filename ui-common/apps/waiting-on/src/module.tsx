import { InboxIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'

/**
 * What Waiting On exposes to the workspace. Stub from the Phase 2 pre-wiring: the real `Routes`,
 * `Providers`, `useTodayItems` and `createDemoFetch` are added in plan task 2.6.
 */
export const productModule: ProductModule = {
  id: 'waiting-on',
  service: 'waiting-on',
  title: 'Waiting On',
  tagline: 'Follow up on refunds, claims and approvals until they are settled.',
  description:
    'Track what you are owed, let durable follow-ups chase it, and keep a draft letter ready.',
  accent: 'var(--pp-color-accent)',
  icon: InboxIcon,
  nav: [
    { to: '/', label: 'Waiting list', end: true },
    { to: '/new', label: 'Add item' },
  ],
  Routes: () => null,
}
