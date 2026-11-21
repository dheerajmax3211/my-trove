import { ApiProvider } from '@platform/api-client'
import { AuthProvider, RequireAuth, useAuth } from '@platform/auth-web'
import {
  AppShell,
  Button,
  InboxIcon,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  Spinner,
  ToastProvider,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { AccountPage } from './AccountPage'
import { RequestsPage } from './RequestsPage'
import { SignIn } from './SignIn'
import { createDemoRuntime, type DemoRuntime } from './runtime'

function NavItem({
  to,
  end,
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
      <NavLink to={to} end={end ?? false}>
        <span style={{ display: 'inline-flex' }} aria-hidden="true">
          {icon}
        </span>
        {children}
      </NavLink>
    </SidebarLink>
  )
}

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 'var(--pp-text-body-small-size)',
      }}
    >
      <span className="hide-sm">Theme</span>
      <Select
        size="sm"
        aria-label="Theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemePreference)}
        style={{ width: 'auto' }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>
    </div>
  )
}

function Shell({ runtime }: { runtime: DemoRuntime }) {
  const { user, signOut } = useAuth()
  const initials = (user?.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase()
  return (
    <AppShell
      brand="Waiting On"
      sidebar={
        <SidebarNav label="Demo">
          <SidebarSection title="Workspace">
            <NavItem to="/demo" end icon={<InboxIcon />}>
              Requests
            </NavItem>
            <NavItem to="/demo/account" icon={<span className="avatar">{initials}</span>}>
              Account
            </NavItem>
          </SidebarSection>
          <SidebarSection title="Gallery">
            <SidebarLink asChild>
              <Link to="/">Back to components</Link>
            </SidebarLink>
          </SidebarSection>
        </SidebarNav>
      }
      topbar={
        <>
          <ThemeSelect />
          <div className="user-chip hide-sm">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span>{user?.email}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </>
      }
    >
      <Routes>
        <Route index element={<RequestsPage runtime={runtime} />} />
        <Route path="account" element={<AccountPage runtime={runtime} />} />
      </Routes>
    </AppShell>
  )
}

/** The signed-in demo: auth + api packages wired into an AppShell. Works with no backend or Firebase project. */
export function DemoApp({ runtime: provided }: { runtime?: DemoRuntime }) {
  const [runtime] = useState(() => provided ?? createDemoRuntime())
  return (
    <AuthProvider client={runtime.authClient}>
      <ApiProvider client={runtime.apiClient}>
        <ToastProvider>
          <RequireAuth
            loading={
              <div className="signin">
                <Spinner size={32} label="Checking your session" />
              </div>
            }
            fallback={<SignIn mode={runtime.mode} />}
          >
            <Shell runtime={runtime} />
          </RequireAuth>
        </ToastProvider>
      </ApiProvider>
    </AuthProvider>
  )
}
