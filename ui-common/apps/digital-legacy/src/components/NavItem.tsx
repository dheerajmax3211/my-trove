import { SidebarLink } from '@platform/ui'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

export function NavItem({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <SidebarLink asChild>
      <NavLink to={to} end={end ?? false}>
        {children}
      </NavLink>
    </SidebarLink>
  )
}
