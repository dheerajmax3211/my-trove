import { AlertIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'

/**
 * What Home Pulse exposes to the workspace. Stub from the Phase 2 pre-wiring: the real `Routes`,
 * `Providers`, `useTodayItems` and `createDemoFetch` are added in plan task 2.6.
 */
export const productModule: ProductModule = {
  id: 'home-pulse',
  service: 'home-pulse',
  title: 'Home Pulse',
  tagline: 'Watch your appliances and get a nudge when something looks off.',
  description: 'Appliance power draw, learned baselines and alerts when behaviour changes.',
  accent: 'var(--pp-color-accent)',
  icon: AlertIcon,
  nav: [
    { to: '/', label: 'Home', end: true },
    { to: '/alerts', label: 'Alerts' },
    { to: '/devices', label: 'Devices' },
    { to: '/reminders', label: 'Reminders' },
  ],
  Routes: () => null,
}
