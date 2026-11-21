import { useAuth } from '@platform/auth-web'
import {
  AppShell,
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
import type { ReactNode } from 'react'
import { productModule } from '../module'

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

/**
 * The standalone app's frame: navigation, theme and account. The workspace provides its own frame
 * and mounts only the product's routes, so nothing in here is needed there.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  return (
    <AppShell
      brand={
        <ModuleLink to="/" className="ayl-brand">
          <ProductMark product="ask-your-life" size={28} variant="solid" />
          Ask your life
        </ModuleLink>
      }
      sidebar={
        <SidebarNav label="Main">
          <SidebarSection>
            {productModule.nav.map(({ to, label, icon: Icon, end }) => (
              <SidebarLink key={to} asChild>
                <ModuleNavLink to={to} end={end ?? false}>
                  {Icon ? (
                    <span className="ayl-navicon" aria-hidden="true">
                      <Icon />
                    </span>
                  ) : null}
                  {label}
                </ModuleNavLink>
              </SidebarLink>
            ))}
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
      {children}
    </AppShell>
  )
}
