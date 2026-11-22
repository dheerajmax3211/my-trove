import { useAuth } from '@platform/auth-web'
import {
  AppFrame,
  Badge,
  Button,
  ProductMark,
  PromoCard,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  useTheme,
  PillSelect,
  type ThemePreference,
} from '@platform/ui'
import { ModuleLink, ModuleNavLink } from '@platform/workspace-kit'
import { createElement, type ReactNode } from 'react'
import { NAV } from '../navigation'

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

/** The standalone frame: the same AppFrame the workspace uses. Inside the workspace the shell replaces this; the pages do not care which one wraps them. */
export function AppLayout({ demo, children }: { demo: boolean; children: ReactNode }) {
  const { user, signOut } = useAuth()
  const email = user?.email ?? undefined
  const name = user?.displayName ?? email ?? 'Signed in'
  return (
    <AppFrame
      brand={
        <ModuleLink to="/" className="wo-brand">
          <ProductMark product="waiting-on" size={28} variant="solid" />
          <span>Waiting On</span>
        </ModuleLink>
      }
      user={{ name, ...(email ? { email } : {}) }}
      search={false}
      sidebar={
        <SidebarNav label="Main">
          <SidebarSection>
            {NAV.map((item) => (
              <SidebarLink asChild key={item.to}>
                <ModuleNavLink to={item.to} end={item.end ?? false}>
                  {item.icon ? (
                    <span style={{ display: 'inline-flex' }} aria-hidden="true">
                      {createElement(item.icon, { size: 18 })}
                    </span>
                  ) : null}
                  {item.label}
                </ModuleNavLink>
              </SidebarLink>
            ))}
          </SidebarSection>
        </SidebarNav>
      }
      headerEnd={
        <>
          {demo ? (
            <Badge variant="warning" className="wo-hide-xs">
              Demo data
            </Badge>
          ) : null}
          <ThemeSelect />
          <Button size="sm" variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </>
      }
      promo={
        <PromoCard
          title="Add what you are owed"
          description="A refund, a claim, an approval. We keep the follow-ups going."
          action={
            <Button asChild size="sm">
              <ModuleLink to="/new">Add an item</ModuleLink>
            </Button>
          }
        />
      }
    >
      {children}
    </AppFrame>
  )
}
