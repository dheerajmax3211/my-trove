import { Route, Routes } from 'react-router-dom'
// The workspace imports this module without main.tsx, so the pages bring their own styles.
import './app.css'
import './switch.css'
import { OverviewPage } from './features/overview/OverviewPage'
import { PolicyPage } from './features/policy/PolicyPage'
import { TimelinePage } from './features/timeline/TimelinePage'
import { TrusteesPage } from './features/trustees/TrusteesPage'
import { VaultPage } from './features/vault/VaultPage'

/**
 * The owner's pages. Paths are relative, so the workspace mounts them under `/app/digital-legacy/*`. The trustee
 * portal (`/trustee/*`) is deliberately not here: trustees sign in with an access token, not as the owner.
 */
export function OwnerRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="vault" element={<VaultPage />} />
      <Route path="trustees" element={<TrusteesPage />} />
      <Route path="policy" element={<PolicyPage />} />
      <Route path="timeline" element={<TimelinePage />} />
      <Route path="*" element={<OverviewPage />} />
    </Routes>
  )
}
