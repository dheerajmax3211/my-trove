import { SettingsIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import { createAdminDemoFetch } from './demo/demoFetch'
import { SECTIONS } from './lib/sections'
import { AdminRoutes } from './routes'

/**
 * The admin console as a workspace module (plan task 2.4). `requiredPermission` is deliberately undefined: every
 * signed-in person may open the module, and each screen then gates itself on its own permission (and still copes with
 * a 403 from the API). The workspace binds the API client to `<gateway>/api/auth`; calls to the platform service go to
 * the sibling `<gateway>/api/platform` through the same client (see `siblingClient` in `lib/api.tsx`).
 */
export const adminModule: ProductModule = {
  id: 'admin',
  service: 'auth',
  title: 'Admin',
  tagline: 'Run the platform: people, roles, usage and flags.',
  description:
    'Users and roles, usage analytics for every user, the audit log, feature flags and the plan limits. Each screen shows only what your role allows.',
  accent: 'var(--pp-color-accent)',
  icon: SettingsIcon,
  nav: SECTIONS.map(({ to, label, end, icon, permission }) => ({
    to,
    label,
    ...(end ? { end } : {}),
    ...(icon ? { icon } : {}),
    ...(permission ? { permission } : {}),
  })),
  Routes: AdminRoutes,
  createDemoFetch: () => createAdminDemoFetch(),
}
