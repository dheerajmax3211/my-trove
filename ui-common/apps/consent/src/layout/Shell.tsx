import { useAuth } from '@platform/auth-web'
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  VisuallyHidden,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AuditPage } from '../features/audit/pages/AuditPage'
import { ClientsPage } from '../features/clients/pages/ClientsPage'
import { DashboardPage } from '../features/dashboard/pages/DashboardPage'
import { useDashboard } from '../features/dashboard/hooks/useDashboard'
import { GrantsPage } from '../features/grants/pages/GrantsPage'
import { HistoryPage } from '../features/history/pages/HistoryPage'
import { RequestsPage } from '../features/requests/pages/RequestsPage'
import { VaultPage } from '../features/vault/pages/VaultPage'
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
      <NavLink to={to} end={end ?? false}>
        {children}
        {badge}
      </NavLink>
    </SidebarLink>
  )
}

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <Select
      size="sm"
      aria-label="Theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemePreference)}
      style={{ width: 'auto' }}
    >
      <option value="system">System theme</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </Select>
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

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="That page does not exist."
      action={
        <Button asChild>
          <Link to="/">Back to the overview</Link>
        </Button>
      }
    />
  )
}

export function Shell({ runtime }: { runtime: Runtime }) {
  const { user, signOut } = useAuth()
  const initials = (user?.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase()
  useRouteFocus()

  return (
    <AppShell
      brand={<span className="brand">Consent</span>}
      sidebar={<Navigation />}
      sidebarFooter={runtime.backend ? <DemoTools backend={runtime.backend} /> : undefined}
      topbar={
        <>
          <ThemeSelect />
          <div className="user-chip hide-sm">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span>{user?.email}</span>
          </div>
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
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="grants" element={<GrantsPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}
