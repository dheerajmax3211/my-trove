import { useAuth } from '@platform/auth-web'
import {
  AppShell,
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
import { ModuleLink, ModuleNavLink } from '@platform/workspace-kit'
import { createElement, type ReactNode } from 'react'
import { NAV } from '../navigation'

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

/** The standalone frame. Inside the workspace the shell replaces this; the pages do not care which one wraps them. */
export function AppLayout({ demo, children }: { demo: boolean; children: ReactNode }) {
  const { user, signOut } = useAuth()
  return (
    <AppShell
      brand={
        <ModuleLink to="/" className="wo-brand">
          <ProductMark product="waiting-on" size={28} variant="solid" />
          Waiting On
        </ModuleLink>
      }
      sidebar={
        <SidebarNav label="Main">
          <SidebarSection>
            {NAV.map((item) => (
              <SidebarLink asChild key={item.to}>
                <ModuleNavLink to={item.to} end={item.end ?? false}>
                  {item.icon ? (
                    <span style={{ display: 'inline-flex' }} aria-hidden="true">
                      {createElement(item.icon)}
                    </span>
                  ) : null}
                  {item.label}
                </ModuleNavLink>
              </SidebarLink>
            ))}
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
      {children}
    </AppShell>
  )
}
