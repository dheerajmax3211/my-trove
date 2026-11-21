import { useAuth } from '@platform/auth-web'
import {
  AppShell,
  Button,
  InboxIcon,
  PlusIcon,
  SearchIcon,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { useCallback, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSlashShortcut } from '../lib/useSlashShortcut'

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
        <span className="ayl-navicon" aria-hidden="true">
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
    <Select
      size="sm"
      aria-label="Theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemePreference)}
      className="ayl-theme"
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </Select>
  )
}

/** App frame: navigation, theme and account. "/" jumps to search from any page. */
export function Shell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // On the search page the page itself focuses the box; elsewhere, go there (it focuses on arrival).
  useSlashShortcut(
    useCallback(() => {
      if (pathname !== '/') void navigate('/')
    }, [pathname, navigate]),
  )

  return (
    <AppShell
      brand={
        <Link to="/" className="ayl-brand">
          Ask your life
        </Link>
      }
      sidebar={
        <SidebarNav label="Main">
          <SidebarSection>
            <NavItem to="/" end icon={<SearchIcon />}>
              Search
            </NavItem>
            <NavItem to="/add" icon={<PlusIcon />}>
              Add content
            </NavItem>
            <NavItem to="/library" icon={<InboxIcon />}>
              Library
            </NavItem>
          </SidebarSection>
        </SidebarNav>
      }
      topbar={
        <>
          <ThemeSelect />
          <span className="ayl-user">{user?.email}</span>
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
