import { ApiProvider, createApiQueryClient } from '@platform/api-client'
import { AuthProvider, RequireAuth } from '@platform/auth-web'
import { Button, EmptyState, Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import type { QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { ClockProvider } from './clock'
import { SignIn } from './features/auth/SignIn'
import { ActivityPage } from './features/money/pages/ActivityPage'
import { MovePage } from './features/money/pages/MovePage'
import { AllowancesPage } from './features/allowances/pages/AllowancesPage'
import { ApprovalsPage } from './features/approvals/pages/ApprovalsPage'
import { DashboardPage } from './features/household/pages/DashboardPage'
import { HouseholdLayout } from './features/household/pages/HouseholdLayout'
import { RootRedirect } from './features/household/pages/RootRedirect'
import { WelcomePage } from './features/household/pages/WelcomePage'
import { MembersPage } from './features/members/pages/MembersPage'
import { ReconciliationPage } from './features/reconciliation/pages/ReconciliationPage'
import { StatementPage } from './features/statement/pages/StatementPage'
import type { Runtime } from './runtime'
import { RuntimeContext } from './runtimeContext'

function NotFound() {
  return (
    <main className="ft-signin">
      <EmptyState
        title="That page does not exist"
        description="The link may be old, or you may have followed it from somewhere that changed."
        action={
          <Button asChild>
            <Link to="/">Go to your household</Link>
          </Button>
        }
      />
    </main>
  )
}

function SignedInRoutes() {
  return (
    <Routes>
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
    </Routes>
  )
}

export interface AppProps {
  runtime: Runtime
  /** Inject a QueryClient (tests turn retries off). */
  queryClient?: QueryClient
  /** localStorage key for the theme choice; `null` disables persistence. */
  themeStorageKey?: string | null
}

/** Providers and routes. The router itself is supplied by the caller (BrowserRouter in main, MemoryRouter in tests). */
export function App({ runtime, queryClient, themeStorageKey }: AppProps) {
  const [owned] = useState(() => createApiQueryClient())
  return (
    <ThemeProvider {...(themeStorageKey !== undefined ? { storageKey: themeStorageKey } : {})}>
      <RuntimeContext value={runtime}>
        <ClockProvider now={runtime.now}>
          <AuthProvider client={runtime.authClient}>
            <ApiProvider client={runtime.apiClient} queryClient={queryClient ?? owned}>
              <ToastProvider>
                <RequireAuth
                  loading={
                    <div className="ft-signin">
                      <Spinner size={32} label="Checking your session" />
                    </div>
                  }
                  fallback={<SignIn />}
                >
                  <SignedInRoutes />
                </RequireAuth>
              </ToastProvider>
            </ApiProvider>
          </AuthProvider>
        </ClockProvider>
      </RuntimeContext>
    </ThemeProvider>
  )
}
