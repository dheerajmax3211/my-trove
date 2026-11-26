import { BellIcon, ClockIcon, HomeIcon, LockIcon, TreeIcon, UsersIcon } from '@platform/ui'
import type { ProductModule } from '@platform/workspace-kit'
import { OwnerRoutes } from './OwnerRoutes'
import { createDemoFetch } from './demoFetch'
import { useTodayItems } from './features/today'
import { VaultKeyProvider } from './features/vault/VaultKeyContext'

/**
 * What Digital Legacy exposes to the workspace: the owner's pages only (overview, vault, trustees, check-in
 * policy, timeline). The trustee portal signs in with trustee access tokens rather than the owner's session,
 * so it is a separate export (`@platform/digital-legacy/trustee`) that the workspace serves at `/trustee`,
 * outside its sign-in.
 *
 * `Providers` holds the in-memory vault key. Leaving the module, signing out or closing the tab unmounts it,
 * and the provider zero-fills the key on the way out. Nothing here writes a key or a plaintext anywhere.
 */
export const productModule: ProductModule = {
  id: 'digital-legacy',
  service: 'digital-legacy',
  title: 'Digital Legacy',
  tagline: 'Plan what the people you trust can open if you are no longer around.',
  description:
    'An encrypted vault of instructions and secrets, released to trustees only if you stop checking in. It is locked in your browser, so the server never reads it.',
  accent: 'var(--pp-color-product-digital-legacy)',
  icon: TreeIcon,
  nav: [
    { to: '/', label: 'Overview', end: true, icon: HomeIcon },
    { to: '/vault', label: 'Vault', icon: LockIcon },
    { to: '/trustees', label: 'Trustees', icon: UsersIcon },
    { to: '/policy', label: 'Check-in policy', icon: BellIcon },
    { to: '/timeline', label: 'Timeline', icon: ClockIcon },
  ],
  Providers: VaultKeyProvider,
  Routes: OwnerRoutes,
  useTodayItems,
  createDemoFetch,
}
