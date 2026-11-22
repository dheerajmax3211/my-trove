import { useAuth } from '@platform/auth-web'
import {
  AppFrame,
  Button,
  PillSelect,
  ProductMark,
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

/**
 * The standalone app's frame: navigation, theme and account. The workspace provides its own frame
 * and mounts only the product's routes, so nothing in here is needed there.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  return (
    <AppFrame
      brand={
        <ModuleLink to="/" className="ayl-brand">
          <ProductMark product="ask-your-life" size={28} variant="solid" />
          Ask your life
        </ModuleLink>
      }
      user={{
        name: user?.displayName ?? user?.email ?? 'Signed in',
        ...(user?.email ? { email: user.email } : {}),
      }}
      search={false}
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
      headerEnd={
        <>
          <ThemeSelect />
          <Button size="sm" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </>
      }
    >
      {children}
    </AppFrame>
  )
}
