import { Button, EmptyState, IllustrationSearch, PageHeader } from '@platform/ui'
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
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        illustration={<IllustrationSearch />}
        title="Nothing lives at this address"
        description="Use the navigation to find what you were looking for, or go back to the overview."
        action={
          <Button asChild>
            <ModuleLink to="/">Back to the overview</ModuleLink>
          </Button>
        }
      />
    </>
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
