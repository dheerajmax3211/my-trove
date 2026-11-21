import { useAuth } from '@platform/auth-web'
import {
  AppShell,
  Badge,
  Button,
  InboxIcon,
  PlusIcon,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

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
    <div className="wo-theme">
      <span className="wo-hide-sm">Theme</span>
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

/** Moves focus to the page heading after each navigation so keyboard and screen reader users land on the new page. */
function useFocusHeadingOnNavigate() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return // first render: leave focus where the browser put it
    previous.current = pathname
    const heading = document.querySelector<HTMLElement>('main h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: false })
  }, [pathname])
}

export function AppLayout({ demo }: { demo: boolean }) {
  const { user, signOut } = useAuth()
  useFocusHeadingOnNavigate()
  return (
    <AppShell
      brand={
        <Link to="/" className="wo-brand">
          <span className="wo-hide-xs">
            <InboxIcon />
          </span>{' '}
          Waiting On
        </Link>
      }
      sidebar={
        <SidebarNav label="Main">
          <SidebarSection title="Follow-ups">
            <NavItem to="/" end icon={<InboxIcon />}>
              Waiting list
            </NavItem>
            <NavItem to="/new" icon={<PlusIcon />}>
              Add item
            </NavItem>
          </SidebarSection>
        </SidebarNav>
      }
      topbar={
        <>
          {demo ? (
            <Badge variant="warning" className="wo-hide-xs">
              Demo data
            </Badge>
          ) : null}
          <ThemeSelect />
          <span className="wo-hide-sm">{user?.email}</span>
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
