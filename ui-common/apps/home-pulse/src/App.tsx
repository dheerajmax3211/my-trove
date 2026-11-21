import { ApiProvider } from '@platform/api-client'
import type { QueryClient } from '@tanstack/react-query'
import { AuthProvider, RequireAuth } from '@platform/auth-web'
import { Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import { HomePulseRoutes } from './routes'
import { ClockProvider } from './lib/clock'
import { RuntimeProvider, type Runtime } from './runtime'
import { AppLayout } from './shell/AppLayout'
import { SignIn } from './shell/SignIn'

/**
 * The standalone app: sign-in, its own layout and the same `HomePulseRoutes` the workspace mounts. The router itself
 * is supplied by the caller (BrowserRouter in main.tsx, MemoryRouter in tests), and so is the runtime (demo or live).
 */
export function App({ runtime, queryClient }: { runtime: Runtime; queryClient?: QueryClient }) {
  return (
    <div data-product="home-pulse" className="hp-root">
      <RuntimeProvider runtime={runtime}>
        <ClockProvider clock={runtime.clock}>
          <ThemeProvider>
            <AuthProvider client={runtime.authClient}>
              <ApiProvider client={runtime.apiClient} {...(queryClient ? { queryClient } : {})}>
                <ToastProvider>
                  <RequireAuth
                    loading={
                      <div className="hp-signin">
                        <Spinner size={32} label="Checking your session" />
                      </div>
                    }
                    fallback={<SignIn />}
                  >
                    <AppLayout>
                      <HomePulseRoutes />
                    </AppLayout>
                  </RequireAuth>
                </ToastProvider>
              </ApiProvider>
            </AuthProvider>
          </ThemeProvider>
        </ClockProvider>
      </RuntimeProvider>
    </div>
  )
}
