import { useAuth } from '@platform/auth-web'
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  ProductMark,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { ModuleNavLink } from '@platform/workspace-kit'
import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAlerts } from '../features/alerts/hooks'
import { HOME_PULSE_NAV } from '../module'
import { useRuntime } from '../runtime'

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="hp-theme-select">
      <span className="hp-hide-sm">Theme</span>
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
    <Badge variant="danger" className="hp-nav-count">
      {count}
      <span className="hp-sr-only"> open</span>
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

/** The standalone app's frame. Inside the workspace the workspace's own shell is used instead. */
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const { mode } = useRuntime()
  const who = user?.displayName ?? user?.email ?? 'You'
  useFocusMainOnNavigate()

  return (
    <AppShell
      brand={
        <span className="hp-brand">
          <ProductMark product="home-pulse" variant="solid" size={28} />
          Home Pulse
        </span>
      }
      sidebar={
        <SidebarNav label="Primary">
          <SidebarSection title="Your home">
            {HOME_PULSE_NAV.map((item) => (
              <SidebarLink asChild key={item.to}>
                <ModuleNavLink to={item.to} end={item.end ?? false}>
                  {item.icon ? (
                    <span className="hp-nav-icon" aria-hidden="true">
                      <item.icon size={20} />
                    </span>
                  ) : null}
                  {item.label}
                  {item.to === '/alerts' ? <AlertCount /> : null}
                </ModuleNavLink>
              </SidebarLink>
            ))}
          </SidebarSection>
        </SidebarNav>
      }
      topbar={
        <>
          {mode === 'demo' ? (
            <Badge variant="warning" className="hp-hide-xs">
              Demo data
            </Badge>
          ) : null}
          <ThemeSelect />
          <div className="hp-user-chip hp-hide-sm">
            <Avatar name={who} size="xs" decorative />
            <span>{user?.email}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </>
      }
    >
      {children}
    </AppShell>
  )
}
