import { ApiProvider } from '@platform/api-client'
import { AuthProvider, RequireAuth, useAuth } from '@platform/auth-web'
import { Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import type { QueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Outlet, Route, Routes } from 'react-router-dom'
import { CoreRoutes } from './core/CoreRoutes'
import { CoreEnvProvider, type CoreEnv } from './core/env'
import { AccountPage } from './features/account/pages/AccountPage'
import { AdminPage } from './features/admin/pages/AdminPage'
import { HomePage } from './features/home/HomePage'
import { DemoSignIn } from './features/session/DemoSignIn'
import { SessionGate } from './features/session/SessionGate'
import { SignIn } from './features/session/SignIn'
import { HubShell } from './layout/HubShell'
import { RequireAdmin } from './layout/guards'
import { RuntimeProvider, SharedQueryClientContext, useRuntime } from './runtime/context'
import type { HubRuntime } from './runtime/runtime'

/**
 * The Household module inside the standalone hub: its own API client (bound to the shared service) and its
 * own query cache, apart from the auth client the shell uses, exactly as the workspace mounts it.
 */
function HouseholdScope({ queryClient }: { queryClient: QueryClient }) {
  const runtime = useRuntime()
  const env = useMemo<CoreEnv>(
    () => ({
      now: runtime.now,
      downloadUrl: runtime.downloadUrl,
      saveDownload: runtime.saveDownload,
      directory: Object.fromEntries((runtime.demo?.users ?? []).map((u) => [u.uid, u.displayName])),
    }),
    [runtime],
  )
  return (
    <ApiProvider client={runtime.sharedApi} queryClient={queryClient}>
      <CoreEnvProvider env={env}>
        <Outlet />
      </CoreEnvProvider>
    </ApiProvider>
  )
}

function HubRoutes({ sharedQueryClient }: { sharedQueryClient: QueryClient }) {
  return (
    <Routes>
      <Route element={<HubShell />}>
        <Route element={<HouseholdScope queryClient={sharedQueryClient} />}>
          <Route index element={<HomePage />} />
          <Route path="*" element={<CoreRoutes />} />
        </Route>
        <Route path="account" element={<AccountPage />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
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
  const [sharedQueryClient] = useState(() => runtime.createQueryClient())
  return (
    <ApiProvider client={runtime.authApi} queryClient={queryClient}>
      <SharedQueryClientContext value={sharedQueryClient}>
        <SessionGate>
          <HubRoutes sharedQueryClient={sharedQueryClient} />
        </SessionGate>
      </SharedQueryClientContext>
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
