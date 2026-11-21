import { ApiProvider, createApiQueryClient } from '@platform/api-client'
import { AuthProvider, RequireAuth } from '@platform/auth-web'
import { Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import type { QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ClockProvider } from './clock'
import { SignIn } from './features/auth/SignIn'
import { productModule } from './module'
import { TreasuryRoutes } from './routes'
import type { Runtime } from './runtime'
import { RuntimeContext } from './runtimeContext'
import { StandaloneLayout } from './StandaloneLayout'
import { ViewerProvider } from './viewer'

export interface AppProps {
  runtime: Runtime
  /** Inject a QueryClient (tests turn retries off). */
  queryClient?: QueryClient
  /** localStorage key for the theme choice; `null` disables persistence. */
  themeStorageKey?: string | null
}

/**
 * The standalone app: sign-in, its own chrome, and the same `Routes` and `Providers` the workspace mounts. The router
 * itself is supplied by the caller (BrowserRouter in main, MemoryRouter in tests).
 */
export function App({ runtime, queryClient, themeStorageKey }: AppProps) {
  const [owned] = useState(() => createApiQueryClient())
  return (
    <ThemeProvider {...(themeStorageKey !== undefined ? { storageKey: themeStorageKey } : {})}>
      <div data-product={productModule.id} className="ft-root">
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
                    <ViewerProvider>
                      <StandaloneLayout>
                        <TreasuryRoutes />
                      </StandaloneLayout>
                    </ViewerProvider>
                  </RequireAuth>
                </ToastProvider>
              </ApiProvider>
            </AuthProvider>
          </ClockProvider>
        </RuntimeContext>
      </div>
    </ThemeProvider>
  )
}
