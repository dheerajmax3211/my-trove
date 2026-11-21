import { Button, EmptyState, IllustrationSearch } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { Route, Routes } from 'react-router-dom'
import { ActivityPage } from '../features/activity/pages/ActivityPage'
import { FilesPage } from '../features/files/pages/FilesPage'
import { HouseholdDetailPage } from '../features/households/pages/HouseholdDetailPage'
import { HouseholdsPage } from '../features/households/pages/HouseholdsPage'
import { OverviewPage } from '../features/overview/OverviewPage'
import { RemindersPage } from '../features/reminders/pages/RemindersPage'
import { usePageTitle } from '../lib/usePageTitle'
import './core.css'

export function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <EmptyState
      illustration={<IllustrationSearch />}
      title="Page not found"
      description="That address does not lead anywhere in Household."
      action={
        <Button asChild>
          <ModuleLink to="/">Back to the overview</ModuleLink>
        </Button>
      }
    />
  )
}

/**
 * Every Household page, with paths relative to wherever the module is mounted (`/app/core` in the workspace,
 * the app root standalone). No providers, no layout, no auth: the host supplies those.
 */
export function CoreRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="households" element={<HouseholdsPage />} />
      <Route path="households/:householdId" element={<HouseholdDetailPage />} />
      <Route path="reminders" element={<RemindersPage />} />
      <Route path="files" element={<FilesPage />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
