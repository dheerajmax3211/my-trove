import { useAuth } from '@platform/auth-web'
import {
  AppFrame,
  Badge,
  Button,
  ProductMark,
  PillSelect,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  VisuallyHidden,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { ModuleNavLink } from '@platform/workspace-kit'
import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useDashboard } from '../features/dashboard/hooks/useDashboard'
import { ConsentRoutes } from '../routes'
import type { Runtime } from '../runtime'
import { DemoTools } from './DemoTools'

function NavItem({
  to,
  end,
  children,
  badge,
}: {
  to: string
  end?: boolean
  children: string
  badge?: ReactNode
}) {
  return (
    <SidebarLink asChild>
      <ModuleNavLink to={to} end={end ?? false}>
        {children}
        {badge}
      </ModuleNavLink>
    </SidebarLink>
  )
}

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <PillSelect
      label="Theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemePreference)}
      options={[
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
    />
  )
}

/** After a route change, move focus to the new page heading and update the tab title. */
function useRouteFocus() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('main h1')
    if (heading?.textContent) document.title = `${heading.textContent} · Consent`
    if (first.current) {
      first.current = false
      return
    }
    heading?.setAttribute('tabindex', '-1')
    heading?.focus()
  }, [pathname])
}

function Navigation() {
  const dashboard = useDashboard()
  const pending = dashboard.data?.pendingRequests ?? 0
  return (
    <SidebarNav label="Consent">
      <SidebarSection title="Decide">
        <NavItem to="/" end>
          Overview
        </NavItem>
        <NavItem
          to="/requests"
          badge={
            pending > 0 ? (
              <Badge variant="accent">
                {pending}
                <VisuallyHidden> pending</VisuallyHidden>
              </Badge>
            ) : null
          }
        >
          Requests
        </NavItem>
        <NavItem to="/grants">Grants</NavItem>
      </SidebarSection>
      <SidebarSection title="Manage">
        <NavItem to="/vault">Vault</NavItem>
        <NavItem to="/clients">Apps</NavItem>
      </SidebarSection>
      <SidebarSection title="Trust">
        <NavItem to="/history">Access history</NavItem>
        <NavItem to="/audit">Audit</NavItem>
      </SidebarSection>
    </SidebarNav>
  )
}

/**
 * The standalone app's layout around the module's routes. `data-product` makes every accent inside
 * the product's own (patina); the workspace does the same around a mounted module.
 */
export function Shell({ runtime }: { runtime: Runtime }) {
  const { user, signOut } = useAuth()
  const who = user?.displayName ?? user?.email ?? 'You'
  useRouteFocus()

  return (
    <div data-product="consent" className="product-root">
      <AppFrame
        brand={
          <span className="brand">
            <ProductMark product="consent" variant="solid" size={28} />
            <span className="brand-name">Consent</span>
          </span>
        }
        user={{ name: who, ...(user?.email ? { email: user.email } : {}) }}
        search={false}
        sidebar={<Navigation />}
        promo={runtime.backend ? <DemoTools backend={runtime.backend} /> : undefined}
        headerEnd={
          <>
            <ThemeSelect />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void signOut().then(() => runtime.queryClient.clear())}
            >
              Sign out
            </Button>
          </>
        }
      >
        <ConsentRoutes />
      </AppFrame>
    </div>
  )
}
