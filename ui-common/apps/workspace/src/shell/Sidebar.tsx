import { CodeIcon, HomeIcon, SidebarLink, SidebarNav, SidebarSection, UserIcon } from '@platform/ui'
import { joinPath, useWorkspaceSession, type ProductModule } from '@platform/workspace-kit'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ModuleMark } from '../components/ModuleMark'
import { canOpenDeveloper } from '../lib/developer'
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
  active,
  related = false,
  icon,
  children,
}: {
  to: string
  active: boolean
  /** The page is inside this item and its own pages are listed below: marked softly, no pill. */
  related?: boolean
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <SidebarLink asChild>
      <Link to={to} aria-current={active ? 'page' : undefined} data-related={related || undefined}>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        {children}
      </Link>
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
  const inside = (base: string) => pathname === base || pathname.startsWith(`${base}/`)
  const current = modules.find((module) => inside(moduleBase(module)))
  const currentPages = current && canOpen(current, session) ? visibleNav(current, session) : []
  const pageTo = (module: ProductModule, to: string) => joinPath(moduleBase(module), to)

  // The longest matching in-module page is the current one, so `/` and `/new` never both light up.
  const activePage = current
    ? currentPages
        .filter((page) => {
          const target = pageTo(current, page.to)
          return (page.end ?? page.to === '/') ? pathname === target : inside(target)
        })
        .sort((a, b) => pageTo(current, b.to).length - pageTo(current, a.to).length)[0]
    : undefined

  const moduleItem = (module: ProductModule) => (
    <Item
      key={module.id}
      to={moduleBase(module)}
      active={inside(moduleBase(module)) && !(current === module && activePage)}
      related={current === module && Boolean(activePage)}
      icon={<ModuleMark module={module} size={22} variant="solid" />}
    >
      {module.title}
    </Item>
  )

  return (
    <SidebarNav label="Workspace" className={styles.nav}>
      <SidebarSection>
        <Item to="/" active={pathname === '/'} icon={<HomeIcon size={18} />}>
          Home
        </Item>
      </SidebarSection>

      {products.length > 0 ? (
        <SidebarSection title="Products">{products.map(moduleItem)}</SidebarSection>
      ) : null}

      {current && currentPages.length > 0 ? (
        <SidebarSection title={`In ${current.title}`} data-testid="module-nav">
          {currentPages.map((page) => (
            <Item
              key={page.to}
              to={pageTo(current, page.to)}
              active={page === activePage}
              icon={page.icon ? <page.icon size={18} /> : <span className={styles.dot} />}
            >
              {page.label}
            </Item>
          ))}
        </SidebarSection>
      ) : null}

      {admin ? <SidebarSection title="Admin">{moduleItem(admin)}</SidebarSection> : null}

      {canOpenDeveloper(session) ? (
        <SidebarSection title="Build">
          <Item to="/developer" active={pathname === '/developer'} icon={<CodeIcon size={18} />}>
            Developer
          </Item>
        </SidebarSection>
      ) : null}

      <SidebarSection>
        <Item to="/account" active={pathname === '/account'} icon={<UserIcon size={18} />}>
          Account
        </Item>
      </SidebarSection>
    </SidebarNav>
  )
}
