import { useAuth } from '@platform/auth-web'
import {
  AppShell,
  Button,
  Select,
  SidebarLink,
  SidebarNav,
  SidebarSection,
  useTheme,
  type ThemePreference,
} from '@platform/ui'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useRuntime } from '../../../runtimeContext'
import { writeStored } from '../../../lib/storage'
import { useHouseholds } from '../hooks/useHouseholds'
import { FirstUseNotice } from './FirstUseNotice'

export const LAST_HOUSEHOLD_KEY = 'ft:last-household'

export interface NavItem {
  to: string
  label: string
  end?: boolean
}

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

function HouseholdSwitcher({ currentId }: { currentId: string | null }) {
  const households = useHouseholds()
  const navigate = useNavigate()
  const list = households.data ?? []
  if (list.length === 0) return null
  return (
    <Select
      size="sm"
      aria-label="Household"
      value={currentId ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new') void navigate('/welcome')
        else {
          writeStored(LAST_HOUSEHOLD_KEY, e.target.value)
          void navigate(`/h/${e.target.value}`)
        }
      }}
      className="ft-inline-select"
    >
      {currentId === null ? (
        <option value="" disabled>
          Choose a household
        </option>
      ) : null}
      {list.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name}
        </option>
      ))}
      <option value="__new">New household...</option>
    </Select>
  )
}

/** In demo mode: play any of the household members without signing out. */
function PersonaSwitcher() {
  const { demo } = useRuntime()
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

export interface FrameProps {
  nav: NavItem[]
  currentHouseholdId: string | null
  children: ReactNode
}

/** App chrome: sidebar navigation, household switcher, theme, who you are, and the bookkeeping-only reminder. */
export function Frame({ nav, currentHouseholdId, children }: FrameProps) {
  const { user, signOut } = useAuth()
  const queryClient = useQueryClient()
  const initial = (user?.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase()
  return (
    <AppShell
      brand="Family Treasury"
      sidebar={
        <SidebarNav label="Main">
          <SidebarSection>
            {nav.map((item) => (
              <SidebarLink asChild key={item.to}>
                <NavLink to={item.to} end={item.end ?? false}>
                  {item.label}
                </NavLink>
              </SidebarLink>
            ))}
          </SidebarSection>
        </SidebarNav>
      }
      sidebarFooter={
        <p className="ft-footnote">Bookkeeping only. No real money ever moves in this app.</p>
      }
      topbar={
        <>
          <HouseholdSwitcher currentId={currentHouseholdId} />
          <PersonaSwitcher />
          <ThemeSelect />
          <span className="ft-user hide-sm" title={user?.email ?? ''}>
            <span className="ft-avatar" aria-hidden="true">
              {initial}
            </span>
            {user?.displayName ?? user?.email}
          </span>
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
    >
      <FirstUseNotice />
      {children}
    </AppShell>
  )
}
