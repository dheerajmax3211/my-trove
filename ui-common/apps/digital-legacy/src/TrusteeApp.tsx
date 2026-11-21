import { AppShell, Button, SidebarNav, SidebarSection } from '@platform/ui'
import { Route, Routes } from 'react-router-dom'
import { NavItem } from './components/NavItem'
import { ThemeSelect } from './components/ThemeSelect'
import { AcceptPage } from './features/trusteePortal/AcceptPage'
import { CombinePage } from './features/trusteePortal/CombinePage'
import { PortalPage } from './features/trusteePortal/PortalPage'
import { TrusteeHome } from './features/trusteePortal/TrusteeHome'
import { TrusteeSessionProvider, useTrusteeSession } from './features/trusteePortal/TrusteeSession'
import type { Runtime } from './runtime'

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

/**
 * The trustee portal. No Firebase: it has its own API client that sends `Authorization: Trustee
 * <token>`, so an owner session and a trustee session can never be confused.
 */
export function TrusteeApp({ runtime }: { runtime: Runtime }) {
  return (
    <TrusteeSessionProvider runtime={runtime}>
      <Shell />
    </TrusteeSessionProvider>
  )
}
