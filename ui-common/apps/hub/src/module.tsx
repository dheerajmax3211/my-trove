import { InboxIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'

/**
 * The hub's households, reminders, files and activity, exposed as the `core` module (id `core`, service
 * `shared`). Stub from the Phase 2 pre-wiring: the real module is plan task 2.6.
 */
export const productModule: ProductModule = {
  id: 'core',
  service: 'shared',
  title: 'Household',
  tagline: 'Your households, reminders and files in one place.',
  description: 'Share reminders and files with the people you live with, and see what happened.',
  accent: 'var(--pp-color-accent)',
  icon: InboxIcon,
  nav: [
    { to: '/', label: 'Home', end: true },
    { to: '/households', label: 'Households' },
    { to: '/reminders', label: 'Reminders' },
    { to: '/files', label: 'Files' },
    { to: '/activity', label: 'Activity' },
  ],
  requiredPermission: 'products:use',
  Routes: () => null,
}
