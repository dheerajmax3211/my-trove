import { useAuth } from '@platform/auth-web'
import {
  AlertIcon,
  AppShell,
  Badge,
  Button,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { useEffect, useRef, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAlerts } from '../features/alerts/hooks'
import { useRuntime } from '../runtime'

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
        <span className="nav-icon" aria-hidden="true">
          {icon}
        </span>
        {children}
      </NavLink>
    </SidebarLink>
  )
}

const HomeIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 11l9-8 9 8M5 10v10h14V10" />
  </svg>
)
const PlugIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v3" />
  </svg>
)
const CalendarIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />
  </svg>
)

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="theme-select">
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

/** The count next to "Alerts" in the nav; the number is also spoken as part of the link's name. */
function AlertCount() {
  const alerts = useAlerts('OPEN')
  const count = alerts.data?.length ?? 0
  if (count === 0) return null
  return (
    <Badge variant="danger" className="nav-count">
      {count}
      <span className="sr-only"> open</span>
    </Badge>
  )
}

/** Moves focus to the main region after a client-side navigation so keyboard and screen reader users start at the top. */
function useFocusMainOnNavigate() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.querySelector<HTMLElement>('main')?.focus()
  }, [pathname])
}

export function AppLayout() {
  const { user, signOut } = useAuth()
  const { mode } = useRuntime()
  const initials = (user?.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase()
  useFocusMainOnNavigate()

  return (
    <AppShell
      brand={<span className="brand">Home Pulse</span>}
      sidebar={
        <SidebarNav label="Primary">
          <SidebarSection title="Your home">
            <NavItem to="/" end icon={<HomeIcon />}>
              Home
            </NavItem>
            <NavItem to="/alerts" icon={<AlertIcon size={20} />}>
              Alerts <AlertCount />
            </NavItem>
            <NavItem to="/devices" icon={<PlugIcon />}>
              Devices
            </NavItem>
            <NavItem to="/reminders" icon={<CalendarIcon />}>
              Reminders
            </NavItem>
          </SidebarSection>
        </SidebarNav>
      }
      topbar={
        <>
          {mode === 'demo' ? (
            <Badge variant="warning" className="hide-xs">
              Demo data
            </Badge>
          ) : null}
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
      <Outlet />
    </AppShell>
  )
}
