/*
 * The module registry: every product the workspace can host.
 *
 * Importing other workspace packages' TypeScript sources works with no extra configuration:
 *  - each app declares `"exports": { "./module": "./src/module.tsx" }`, and pnpm links it into
 *    `node_modules` as a symlink, so Vite resolves it to its real path (outside `node_modules`),
 *    transforms the TSX with the same React plugin, and bundles it, in `vite dev` and `vite build`;
 *  - `tsc` follows the same `exports` entry (moduleResolution "bundler") and type-checks the module
 *    sources under this app's strict tsconfig, which is the same base config the apps use;
 *  - what a module imports (`@platform/ui`, `@platform/api-client`...) resolves through the
 *    `@platform/source` condition in dev and through `dist` in the build, as for every app.
 * A module that needs a Vite-only feature (CSS modules, `import.meta.env`) is covered by the
 * `vite/client` types in this app's tsconfig.
 */
import { adminModule } from '@platform/admin-console'
import { productModule as askYourLife } from '@platform/ask-your-life/module'
import { productModule as consent } from '@platform/consent/module'
import { productModule as digitalLegacy } from '@platform/digital-legacy/module'
import { productModule as familyTreasury } from '@platform/family-treasury/module'
import { productModule as homePulse } from '@platform/home-pulse/module'
import { productModule as core } from '@platform/hub/module'
import { productModule as waitingOn } from '@platform/waiting-on/module'
import type { ModuleNavItem, ProductModule, WorkspaceSession } from '@platform/workspace-kit'

/** Products in the order the sidebar lists them by default, then the admin console. */
export const registry: readonly ProductModule[] = [
  waitingOn,
  consent,
  homePulse,
  askYourLife,
  digitalLegacy,
  familyTreasury,
  core,
  adminModule,
]

export const ADMIN_MODULE_ID = 'admin'

type Can = Pick<WorkspaceSession, 'can'>

/** The admin console is for anyone who can look at people or platform-wide usage. */
export function canSeeAdmin(session: Can): boolean {
  return session.can('users:read') || session.can('usage:read:all')
}

export function isProduct(module: ProductModule): boolean {
  return module.id !== ADMIN_MODULE_ID
}

/**
 * Permissions that would let someone in (any one of them). A module states one with
 * `requiredPermission`, default `products:use`. The admin console is the exception: an AUDITOR has
 * no `products:use` but may read users and usage, so it opens for whoever sees the Admin link, and
 * the console gates each of its screens on its own permission.
 */
export function accessPermissions(module: ProductModule): readonly string[] {
  if (module.requiredPermission) return [module.requiredPermission]
  if (module.id === ADMIN_MODULE_ID) return ['users:read', 'usage:read:all']
  return ['products:use']
}

export function canOpen(module: ProductModule, session: Can): boolean {
  return accessPermissions(module).some((permission) => session.can(permission))
}

export function visibleNav(module: ProductModule, session: Can): ModuleNavItem[] {
  return module.nav.filter((item) => !item.permission || session.can(item.permission))
}

export function findModule(
  modules: readonly ProductModule[],
  id: string | undefined,
): ProductModule | undefined {
  return id ? modules.find((module) => module.id === id) : undefined
}

export const moduleBase = (module: Pick<ProductModule, 'id'>): string => `/app/${module.id}`
