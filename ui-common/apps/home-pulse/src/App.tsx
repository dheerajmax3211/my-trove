import { ApiProvider } from '@platform/api-client'
import type { QueryClient } from '@tanstack/react-query'
import { AuthProvider, RequireAuth } from '@platform/auth-web'
import { Button, EmptyState, Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { AlertsPage } from './features/alerts/pages/AlertsPage'
import { AddAppliancePage, EditAppliancePage } from './features/appliances/pages/ApplianceFormPage'
import { ApplianceDetailPage } from './features/appliances/pages/ApplianceDetailPage'
import { OverviewPage } from './features/appliances/pages/OverviewPage'
import { DevicesPage } from './features/devices/pages/DevicesPage'
import { RemindersPage } from './features/reminders/pages/RemindersPage'
import { ClockProvider } from './lib/clock'
import { RuntimeProvider, type Runtime } from './runtime'
import { AppLayout } from './shell/AppLayout'
import { SignIn } from './shell/SignIn'

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="That address does not exist in Home Pulse."
      action={
        <Button asChild>
          <Link to="/">Go to your appliances</Link>
        </Button>
      }
    />
  )
}

/**
 * Providers and routes. The router itself is supplied by the caller (BrowserRouter in main.tsx,
 * MemoryRouter in tests), and so is the runtime (demo or live).
 */
export function App({ runtime, queryClient }: { runtime: Runtime; queryClient?: QueryClient }) {
  return (
    <RuntimeProvider runtime={runtime}>
      <ClockProvider clock={runtime.clock}>
        <ThemeProvider>
          <AuthProvider client={runtime.authClient}>
            <ApiProvider client={runtime.apiClient} {...(queryClient ? { queryClient } : {})}>
              <ToastProvider>
                <RequireAuth
                  loading={
                    <div className="signin">
                      <Spinner size={32} label="Checking your session" />
                    </div>
                  }
                  fallback={<SignIn />}
                >
                  <Routes>
                    <Route element={<AppLayout />}>
                      <Route index element={<OverviewPage />} />
                      <Route path="appliances/new" element={<AddAppliancePage />} />
                      <Route path="appliances/:id" element={<ApplianceDetailPage />} />
                      <Route path="appliances/:id/edit" element={<EditAppliancePage />} />
                      <Route path="devices" element={<DevicesPage />} />
                      <Route path="alerts" element={<AlertsPage />} />
                      <Route path="reminders" element={<RemindersPage />} />
                      <Route path="home" element={<Navigate to="/" replace />} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </RequireAuth>
              </ToastProvider>
            </ApiProvider>
          </AuthProvider>
        </ThemeProvider>
      </ClockProvider>
    </RuntimeProvider>
  )
}
