import { Button, EmptyState, Illustration } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { Outlet, Route, Routes } from 'react-router-dom'
import { AllowancesPage } from './features/allowances/pages/AllowancesPage'
import { ApprovalsPage } from './features/approvals/pages/ApprovalsPage'
import { FirstUseNotice } from './features/household/components/FirstUseNotice'
import { DashboardPage } from './features/household/pages/DashboardPage'
import { HouseholdLayout } from './features/household/pages/HouseholdLayout'
import { RootRedirect } from './features/household/pages/RootRedirect'
import { WelcomePage } from './features/household/pages/WelcomePage'
import { MembersPage } from './features/members/pages/MembersPage'
import { ActivityPage } from './features/money/pages/ActivityPage'
import { MovePage } from './features/money/pages/MovePage'
import { ReconciliationPage } from './features/reconciliation/pages/ReconciliationPage'
import { StatementPage } from './features/statement/pages/StatementPage'

function NotFound() {
  return (
    <EmptyState
      illustration={<Illustration name="search" />}
      title="That page does not exist"
      description="The link may be old, or you may have followed it from somewhere that changed."
      action={
        <Button asChild>
          <ModuleLink to="/">Go to your household</ModuleLink>
        </Button>
      }
    />
  )
}

/** Everything every screen shares: the one-time "this is bookkeeping" notice, then the page. */
function ModuleFrame() {
  return (
    <div className="ft-module">
      <FirstUseNotice />
      <Outlet />
    </div>
  )
}

/**
 * Family Treasury's pages, without providers, sign-in or app chrome. Paths are relative to wherever the module is
 * mounted: the app root standalone, `/app/family-treasury` in the workspace.
 */
export function TreasuryRoutes() {
  return (
    <Routes>
      <Route element={<ModuleFrame />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/h/:householdId" element={<HouseholdLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="move" element={<MovePage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="allowances" element={<AllowancesPage />} />
          <Route path="statement" element={<StatementPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />
          <Route path="members" element={<MembersPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
