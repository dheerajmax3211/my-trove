import {
  ClockIcon,
  FileIcon,
  HomeIcon,
  InboxIcon,
  KeyIcon,
  LinkIcon,
  LockIcon,
  ShieldIcon,
} from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import { createConsentDemoFetch } from './demo'
import { ConsentRoutes } from './routes'
import { useConsentToday } from './today'

/**
 * What Consent exposes to the workspace. The workspace supplies auth, an API client bound to
 * `<gateway>/api/consent`, the query cache, theme, toasts and the router, so there is no product-specific
 * provider: every screen reads through `useApiClient()`.
 */
export const productModule: ProductModule = {
  id: 'consent',
  service: 'consent',
  title: 'Consent',
  tagline: 'Decide who can read which part of your data, and take it back any time.',
  description:
    'A vault of your own facts, with scoped, revocable access for apps and a tamper-evident log.',
  accent: 'var(--pp-color-product-consent)',
  icon: ShieldIcon,
  nav: [
    { to: '/', label: 'Overview', end: true, icon: HomeIcon },
    { to: '/requests', label: 'Requests', icon: InboxIcon },
    { to: '/grants', label: 'Grants', icon: KeyIcon },
    { to: '/vault', label: 'Vault', icon: LockIcon },
    { to: '/clients', label: 'Apps', icon: LinkIcon },
    { to: '/history', label: 'History', icon: ClockIcon },
    { to: '/audit', label: 'Audit', icon: FileIcon },
  ],
  Routes: ConsentRoutes,
  useTodayItems: useConsentToday,
  createDemoFetch: createConsentDemoFetch,
}
