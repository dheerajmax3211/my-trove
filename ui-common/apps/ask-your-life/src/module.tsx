import { createMockApi } from './mock/mockApi'
import { InboxIcon, PlusIcon, SearchIcon } from '@platform/ui'
import { productVar } from '@platform/tokens'
import type { ProductModule } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { useTodayItems } from './features/documents/hooks/useTodayItems'
import { DEFAULT_SETTINGS, SettingsProvider } from './lib/settings'
import { ProductRoutes } from './routes'

/** Product-specific context. The workspace supplies auth, the API client, the query cache, theme and toasts. */
function Providers({ children }: { children: ReactNode }) {
  return <SettingsProvider value={DEFAULT_SETTINGS}>{children}</SettingsProvider>
}

/**
 * What Ask Your Life exposes to the workspace: three screens (search, add, library), a Today feed for
 * documents that are still indexing or failed to index, and the in-memory mock service for demo mode.
 */
export const productModule: ProductModule = {
  id: 'ask-your-life',
  service: 'ask-your-life',
  title: 'Ask Your Life',
  tagline: 'Search everything you have saved, privately.',
  description:
    'One private search across your notes, receipts and documents. Ask in your own words and see the passage that matches, and why.',
  accent: productVar('ask-your-life'),
  icon: SearchIcon,
  nav: [
    { to: '/', label: 'Search', icon: SearchIcon, end: true },
    { to: '/add', label: 'Add content', icon: PlusIcon },
    { to: '/library', label: 'Library', icon: InboxIcon },
  ],
  Providers,
  Routes: ProductRoutes,
  useTodayItems,
  createDemoFetch: () => createMockApi().fetch,
}
