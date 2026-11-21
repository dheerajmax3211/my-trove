import { BellIcon, ClockIcon, FileIcon, FolderIcon, HomeIcon, UsersIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import { CoreRoutes } from './core/CoreRoutes'
import { createCoreDemoFetch } from './core/demo'
import { CoreProviders } from './core/env'
import { useTodayItems } from './core/today'

/**
 * The hub's households, reminders, files and activity as the `core` module (id `core`, service `shared`).
 *
 * The workspace supplies sign-in, the API client (bound to `<gateway>/api/shared`, so every path is `/v1/...`),
 * the query cache, theme, toasts and the router. The launcher, the account page and the admin pages stay in the
 * standalone hub app. The module itself never calls the auth service.
 */
export const productModule: ProductModule = {
  id: 'core',
  service: 'shared',
  title: 'Household',
  tagline: 'The people you share with, and what you share.',
  description:
    'Create a household for the people you live with, keep a shared list of reminders, share files with a short-lived link, and see who did what.',
  accent: 'var(--pp-color-accent)',
  icon: FolderIcon,
  nav: [
    { to: '/', label: 'Overview', end: true, icon: HomeIcon },
    { to: '/households', label: 'Households', icon: UsersIcon },
    { to: '/reminders', label: 'Reminders', icon: BellIcon },
    { to: '/files', label: 'Files', icon: FileIcon },
    { to: '/activity', label: 'Activity', icon: ClockIcon },
  ],
  requiredPermission: 'products:use',
  Providers: CoreProviders,
  Routes: CoreRoutes,
  useTodayItems,
  createDemoFetch: createCoreDemoFetch,
}
