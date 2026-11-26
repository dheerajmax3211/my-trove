import { AppShell, Button, SidebarNav, SidebarSection } from '@platform/ui'
import { useCallback } from 'react'
import { Route, Routes } from 'react-router-dom'
// The workspace mounts this page outside every module, so it brings the product's styles itself.
import './app.css'
import './switch.css'
import { createTrusteeClient } from './api/trusteeApi'
import { NavItem } from './components/NavItem'
import { ThemeSelect } from './components/ThemeSelect'
import { AcceptPage } from './features/trusteePortal/AcceptPage'
import { CombinePage } from './features/trusteePortal/CombinePage'
import { PortalPage } from './features/trusteePortal/PortalPage'
import { TrusteeHome } from './features/trusteePortal/TrusteeHome'
import { TrusteeSessionProvider, useTrusteeSession } from './features/trusteePortal/TrusteeSession'
import { ClockProvider } from './lib/clock'

function Shell() {
  const { session, forget } = useTrusteeSession()
  return (
    <AppShell
      brand="Digital Legacy: trustee"
      sidebar={
        <SidebarNav label="Trustee">
          <SidebarSection title="Trustee portal">
            <NavItem to="/trustee/portal">My status</NavItem>
            <NavItem to="/trustee/combine">Combine shares</NavItem>
          </SidebarSection>
        </SidebarNav>
      }
      topbar={
        <>
          <ThemeSelect />
          {session ? (
            <Button size="sm" variant="secondary" onClick={forget}>
              Forget this device
            </Button>
          ) : null}
        </>
      }
    >
      <Routes>
        <Route index element={<TrusteeHome />} />
        <Route path="accept" element={<AcceptPage />} />
        <Route path="portal" element={<PortalPage />} />
        <Route path="combine" element={<CombinePage />} />
        <Route path="*" element={<TrusteeHome />} />
      </Routes>
    </AppShell>
  )
}

export interface TrusteePortalProps {
  /** The Digital Legacy service root, e.g. `<gateway>/api/digital-legacy` (paths start at `/v1`). */
  apiBaseUrl: string
  /** Transport (the module's in-memory mock in demo mode). Default: the global fetch. */
  fetch?: typeof fetch
  /** "Now" for countdowns. Default: the real clock. */
  now?: () => number
}

/**
 * The trustee portal, for people the owner invited. Trustees have no account: it never touches the
 * workspace sign-in and has its own API client that sends `Authorization: Trustee <token>`, so an owner
 * session and a trustee session can never be confused. Mount it at `/trustee/*`, outside the sign-in gate;
 * the host supplies the router, theme and toasts.
 */
export function TrusteePortal({ apiBaseUrl, fetch, now = Date.now }: TrusteePortalProps) {
  const createClient = useCallback(
    (token: string | null) =>
      createTrusteeClient({ baseUrl: apiBaseUrl, token, ...(fetch ? { fetch } : {}) }),
    [apiBaseUrl, fetch],
  )
  return (
    <ClockProvider now={now}>
      <div data-product="digital-legacy">
        <TrusteeSessionProvider createClient={createClient}>
          <Shell />
        </TrusteeSessionProvider>
      </div>
    </ClockProvider>
  )
}
