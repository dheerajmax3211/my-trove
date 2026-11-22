import { useAuth } from '@platform/auth-web'
import {
  AppFrame,
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
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { productModule } from './module'
import { useDemoParts } from './runtimeContext'

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  return (
    <Select
      size="sm"
      aria-label="Theme"
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemePreference)}
      className="ft-inline-select"
    >
      <option value="system">System theme</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </Select>
  )
}

/** In demo mode: play any of the household members without signing out. */
function PersonaSwitcher() {
  const demo = useDemoParts()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  if (!demo) return null
  return (
    <Select
      size="sm"
      aria-label="Acting as"
      value={user?.uid ?? ''}
      onChange={(e) => {
        queryClient.clear()
        demo.auth.switchTo(e.target.value)
      }}
      className="ft-inline-select"
    >
      {demo.personas.map((p) => (
        <option key={p.uid} value={p.uid}>
          {p.name}
        </option>
      ))}
    </Select>
  )
}

/**
 * The standalone app's own chrome (the workspace has its own): a sidebar with the module's static pages, theme, who
 * you are and sign out. The household sections live inside the module content, exactly as they do in the workspace.
 */
export function StandaloneLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const queryClient = useQueryClient()
  const who = user?.displayName ?? user?.email ?? ''
  return (
    <AppFrame
      brand={
        <span className="ft-brand">
          <ProductMark product="family-treasury" size={28} variant="solid" />
          Family Treasury
        </span>
      }
      user={{ name: who || 'You', ...(user?.email ? { email: user.email } : {}) }}
      search={false}
      headerEnd={
        <>
          <PersonaSwitcher />
          <ThemeSelect />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              queryClient.clear()
              void signOut()
            }}
          >
            Sign out
          </Button>
        </>
      }
      sidebar={
        <SidebarNav label="Main">
          <SidebarSection>
            {productModule.nav.map((item) => (
              <SidebarLink asChild key={item.to}>
                <ModuleNavLink to={item.to} end={item.end ?? false}>
                  {item.label}
                </ModuleNavLink>
              </SidebarLink>
            ))}
          </SidebarSection>
        </SidebarNav>
      }
      promo={
        <p className="ft-promo-note">Bookkeeping only. No real money ever moves in this app.</p>
      }
    >
      {children}
    </AppFrame>
  )
}
