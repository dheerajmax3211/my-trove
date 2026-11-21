import { Button, EmptyState, Illustration } from '@platform/ui'
import { ModuleLink, useModulePath } from '@platform/workspace-kit'
import { Navigate, Route, Routes } from 'react-router-dom'
import './app.css'
import { AlertsPage } from './features/alerts/pages/AlertsPage'
import { ApplianceDetailPage } from './features/appliances/pages/ApplianceDetailPage'
import { AddAppliancePage, EditAppliancePage } from './features/appliances/pages/ApplianceFormPage'
import { OverviewPage } from './features/appliances/pages/OverviewPage'
import { DevicesPage } from './features/devices/pages/DevicesPage'
import { RemindersPage } from './features/reminders/pages/RemindersPage'

function NotFound() {
  return (
    <EmptyState
      illustration={<Illustration name="search" />}
      title="Page not found"
      description="That address does not exist in Home Pulse."
      action={
        <Button asChild>
          <ModuleLink to="/">Go to your appliances</ModuleLink>
        </Button>
      }
    />
  )
}

function HomeRedirect() {
  const path = useModulePath()
  return <Navigate to={path('/')} replace />
}

/**
 * Home Pulse's pages. Every path is relative to the module base (`/app/home-pulse` in the workspace, empty when the
 * app runs on its own). No providers, sign-in or layout here: the host supplies them.
 */
export function HomePulseRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="appliances/new" element={<AddAppliancePage />} />
      <Route path="appliances/:id" element={<ApplianceDetailPage />} />
      <Route path="appliances/:id/edit" element={<EditAppliancePage />} />
      <Route path="devices" element={<DevicesPage />} />
      <Route path="alerts" element={<AlertsPage />} />
      <Route path="reminders" element={<RemindersPage />} />
      <Route path="home" element={<HomeRedirect />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
