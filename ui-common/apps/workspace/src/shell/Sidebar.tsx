import { HomeIcon, SidebarLink, SidebarNav, SidebarSection, UserIcon } from '@platform/ui'
import { joinPath, useWorkspaceSession, type ProductModule } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ModuleMark } from '../components/ModuleMark'
import { useOnboarding } from '../onboarding/OnboardingProvider'
import {
  ADMIN_MODULE_ID,
  canOpen,
  canSeeAdmin,
  isProduct,
  moduleBase,
  visibleNav,
} from '../modules/registry'
import { useWorkspace } from '../workspace/context'
import styles from './Sidebar.module.css'

function Item({
  to,
  end = false,
  icon,
  children,
}: {
  to: string
  end?: boolean
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <SidebarLink asChild>
      <NavLink to={to} end={end}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        {children}
      </NavLink>
    </SidebarLink>
  )
}

/** Pinned products first (in the order they were pinned), then the rest in registry order. */
export function orderProducts(
  products: readonly ProductModule[],
  pinned: readonly string[],
): ProductModule[] {
  const first = pinned
    .map((id) => products.find((module) => module.id === id))
    .filter((module) => module !== undefined)
  const rest = products.filter((module) => !pinned.includes(module.id))
  return [...first, ...rest]
}

export function Sidebar() {
  const { modules } = useWorkspace()
  const session = useWorkspaceSession()
  const { pinned } = useOnboarding()
  const { pathname } = useLocation()

  const products = orderProducts(
    modules.filter((module) => isProduct(module) && canOpen(module, session)),
    pinned,
  )
  const admin = canSeeAdmin(session)
    ? modules.find((module) => module.id === ADMIN_MODULE_ID && canOpen(module, session))
    : undefined

  // The module the URL is inside, if any: its pages get their own list so the sidebar is the sub-nav.
  const current = modules.find(
    (module) => pathname === moduleBase(module) || pathname.startsWith(`${moduleBase(module)}/`),
  )
  const currentPages = current && canOpen(current, session) ? visibleNav(current, session) : []

  return (
    <SidebarNav label="Workspace">
      <SidebarSection>
        <Item to="/" end icon={<HomeIcon size={18} />}>
          Home
        </Item>
      </SidebarSection>

      {products.length > 0 ? (
        <SidebarSection title="Products">
          {products.map((module) => (
            <Item
              key={module.id}
              to={moduleBase(module)}
              icon={<ModuleMark module={module} size={22} variant="solid" />}
            >
              {module.title}
            </Item>
          ))}
        </SidebarSection>
      ) : null}

      {current && currentPages.length > 0 ? (
        <SidebarSection title={`In ${current.title}`} data-testid="module-nav">
          {currentPages.map((page) => (
            <Item
              key={page.to}
              to={joinPath(moduleBase(current), page.to)}
              end={page.end ?? page.to === '/'}
              icon={page.icon ? <page.icon size={18} /> : <span className={styles.dot} />}
            >
              {page.label}
            </Item>
          ))}
        </SidebarSection>
      ) : null}

      {admin ? (
        <SidebarSection title="Admin">
          <Item
            to={moduleBase(admin)}
            icon={<ModuleMark module={admin} size={22} variant="solid" />}
          >
            {admin.title}
          </Item>
        </SidebarSection>
      ) : null}

      <SidebarSection>
        <Item to="/account" icon={<UserIcon size={18} />}>
          Account
        </Item>
      </SidebarSection>
    </SidebarNav>
  )
}
