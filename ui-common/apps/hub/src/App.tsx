import { ApiProvider } from '@platform/api-client'
import { AuthProvider, RequireAuth, useAuth } from '@platform/auth-web'
import { Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AccountPage } from './features/account/pages/AccountPage'
import { ActivityPage } from './features/activity/pages/ActivityPage'
import { AdminPage } from './features/admin/pages/AdminPage'
import { FilesPage } from './features/files/pages/FilesPage'
import { HomePage } from './features/home/HomePage'
import { HouseholdDetailPage } from './features/households/pages/HouseholdDetailPage'
import { HouseholdsPage } from './features/households/pages/HouseholdsPage'
import { RemindersPage } from './features/reminders/pages/RemindersPage'
import { DemoSignIn } from './features/session/DemoSignIn'
import { SessionGate } from './features/session/SessionGate'
import { SignIn } from './features/session/SignIn'
import { HubShell } from './layout/HubShell'
import { NotFoundPage, RequireAdmin } from './layout/guards'
import { RuntimeProvider, useRuntime } from './runtime/context'
import type { HubRuntime } from './runtime/runtime'

function HubRoutes() {
  return (
    <Routes>
      <Route element={<HubShell />}>
        <Route index element={<HomePage />} />
        <Route path="households" element={<HouseholdsPage />} />
        <Route path="households/:householdId" element={<HouseholdDetailPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="files" element={<FilesPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

/** Everything that needs a signed-in user. Keyed by uid so switching user starts from a clean cache. */
function SignedIn() {
  const runtime = useRuntime()
  const { user } = useAuth()
  return <SignedInTree key={user?.uid} runtime={runtime} />
}

function SignedInTree({ runtime }: { runtime: HubRuntime }) {
  const [queryClient] = useState(() => runtime.createQueryClient())
  return (
    <ApiProvider client={runtime.apiClient} queryClient={queryClient}>
      <SessionGate>
        <HubRoutes />
      </SessionGate>
    </ApiProvider>
  )
}

export interface AppProps {
  runtime: HubRuntime
  /** localStorage key for the theme choice; `null` disables persistence (tests). */
  themeStorageKey?: string | null
}

/** Providers and routes. Mount it inside a router. */
export function App({ runtime, themeStorageKey }: AppProps) {
  return (
    <ThemeProvider {...(themeStorageKey !== undefined ? { storageKey: themeStorageKey } : {})}>
      <RuntimeProvider runtime={runtime}>
        <AuthProvider client={runtime.authClient}>
          <ToastProvider>
            <RequireAuth
              loading={
                <div className="hub-center">
                  <Spinner size={32} label="Checking your session" />
                </div>
              }
              fallback={runtime.mode === 'demo' ? <DemoSignIn /> : <SignIn />}
            >
              <SignedIn />
            </RequireAuth>
          </ToastProvider>
        </AuthProvider>
      </RuntimeProvider>
    </ThemeProvider>
  )
}
