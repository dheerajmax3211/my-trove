import { SidebarLink } from '@platform/ui'
import { ModuleNavLink } from '@platform/workspace-kit'
import type { ReactNode } from 'react'

/** A sidebar link for the trustee portal. `to` goes through `ModuleNavLink`, so it is used as is outside a module base. */
export function NavItem({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <SidebarLink asChild>
      <ModuleNavLink to={to} end={end ?? false}>
        {children}
      </ModuleNavLink>
    </SidebarLink>
  )
}
