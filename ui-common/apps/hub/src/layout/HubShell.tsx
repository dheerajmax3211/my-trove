import { useAuth } from '@platform/auth-web'
import { AppShell, Button, Select, SidebarLink, SidebarNav, SidebarSection } from '@platform/ui'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ThemeSelect } from '../components/ThemeSelect'
import { isAdmin, useProfile } from '../features/session/profile'
import { useRuntime } from '../runtime/context'

function NavItem({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <SidebarLink asChild>
      <NavLink to={to} end={end ?? false}>
        {children}
      </NavLink>
    </SidebarLink>
  )
}

/** After navigating, move focus to the new page so keyboard and screen reader users start at its top. */
function useFocusMainOnNavigation() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    document.querySelector<HTMLElement>('main')?.focus()
  }, [pathname])
}

function DemoUserSwitch() {
  const { demo } = useRuntime()
  const { user } = useAuth()
  if (!demo) return null
  return (
    <div className="hub-inline-control">
      <span className="hub-hide-sm">Demo user</span>
      <Select
        size="sm"
        aria-label="Switch demo user"
        value={user?.uid ?? ''}
        onChange={(e) => void demo.signInAs(e.target.value)}
        style={{ width: 'auto' }}
      >
        {demo.users.map((u) => (
          <option key={u.uid} value={u.uid}>
            {u.displayName}
          </option>
        ))}
      </Select>
    </div>
  )
}

/** The signed-in frame: navigation (Admin only for administrators), theme, user and sign out. */
export function HubShell() {
  const { user, signOut } = useAuth()
  const profile = useProfile()
  const initials = (user?.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase()
  useFocusMainOnNavigation()

  return (
    <AppShell
      brand={
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
          Hub
        </Link>
      }
      sidebar={
        <SidebarNav label="Hub">
          <SidebarSection title="Workspace">
            <NavItem to="/" end>
              Home
            </NavItem>
            <NavItem to="/households">Households</NavItem>
            <NavItem to="/reminders">Reminders</NavItem>
            <NavItem to="/files">Files</NavItem>
            <NavItem to="/activity">Activity</NavItem>
          </SidebarSection>
          <SidebarSection title="You">
            <NavItem to="/account">Account</NavItem>
            {isAdmin(profile) ? <NavItem to="/admin">Admin</NavItem> : null}
          </SidebarSection>
        </SidebarNav>
      }
      topbar={
        <>
          <DemoUserSwitch />
          <ThemeSelect />
          <div className="hub-user-chip hub-hide-sm">
            <span className="hub-avatar" aria-hidden="true">
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
