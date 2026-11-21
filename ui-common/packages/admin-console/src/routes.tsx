import { Button, EmptyState, Illustration, PageHeader } from '@platform/ui'
import { ModuleLink } from '@platform/workspace-kit'
import { Route, Routes } from 'react-router-dom'
import shared from './components/shared.module.css'
import { AuditScreen } from './screens/Audit'
import { FlagsScreen } from './screens/Flags'
import { OverviewScreen } from './screens/Overview'
import { PlansScreen } from './screens/Plans'
import { RolesScreen } from './screens/Roles'
import { UsageScreen } from './screens/Usage'
import { UserDetailScreen } from './screens/UserDetail'
import { UsersScreen } from './screens/Users'

function NotFound() {
  return (
    <div className={shared.stack}>
      <PageHeader eyebrow="Admin" title="Page not found" />
      <EmptyState
        illustration={<Illustration name="search" />}
        title="There is no such admin screen"
        description="Check the address, or go back to the overview to see what you can open."
        action={
          <Button asChild variant="secondary">
            <ModuleLink to="/">Back to the overview</ModuleLink>
          </Button>
        }
      />
    </div>
  )
}

/** Every path is relative to the module base (`/app/admin` in the workspace). Each screen gates itself. */
export function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewScreen />} />
      <Route path="users" element={<UsersScreen />} />
      <Route path="users/:id" element={<UserDetailScreen />} />
      <Route path="roles" element={<RolesScreen />} />
      <Route path="usage" element={<UsageScreen />} />
      <Route path="audit" element={<AuditScreen />} />
      <Route path="flags" element={<FlagsScreen />} />
      <Route path="plans" element={<PlansScreen />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
