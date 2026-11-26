import { Button, EmptyState, Illustration } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { Route, Routes } from 'react-router-dom'
import { AuditPage } from './features/audit/pages/AuditPage'
import { ClientsPage } from './features/clients/pages/ClientsPage'
import { DashboardPage } from './features/dashboard/pages/DashboardPage'
import { GrantsPage } from './features/grants/pages/GrantsPage'
import { HistoryPage } from './features/history/pages/HistoryPage'
import { RequestsPage } from './features/requests/pages/RequestsPage'
import { VaultPage } from './features/vault/pages/VaultPage'

import './app.css'
import './home.css'
function NotFound() {
  return (
    <EmptyState
      illustration={<Illustration name="search" />}
      title="Page not found"
      description="That page does not exist."
      action={
        <Button asChild>
          <ModuleLink to="/">Back to the overview</ModuleLink>
        </Button>
      }
    />
  )
}

/**
 * Every Consent screen, with paths relative to wherever the module is mounted. No providers, no auth,
 * no layout: the workspace wraps this.
 */
export function ConsentRoutes() {
  return (
    <Routes>
      <Route index element={<DashboardPage />} />
      <Route path="requests" element={<RequestsPage />} />
      <Route path="grants" element={<GrantsPage />} />
      <Route path="vault" element={<VaultPage />} />
      <Route path="clients" element={<ClientsPage />} />
      <Route path="history" element={<HistoryPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
