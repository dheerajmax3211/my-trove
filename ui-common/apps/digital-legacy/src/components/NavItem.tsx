import { SidebarLink } from '@platform/ui'
import { ModuleNavLink } from '@platform/workspace-kit'
import type { ReactNode } from 'react'

/** A sidebar link. `to` is module-relative: under the workspace it gains `/app/digital-legacy`, standalone it is unchanged. */
export function NavItem({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <SidebarLink asChild>
      <ModuleNavLink to={to} end={end ?? false}>
        {children}
      </ModuleNavLink>
    </SidebarLink>
  )
}
