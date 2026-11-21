import { ApiProvider } from '@platform/api-client'
import { AuthProvider, RequireAuth, useAuth } from '@platform/auth-web'
import { Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import { WorkspaceSessionProvider, createSession } from '@platform/workspace-kit'
import type { QueryClient } from '@tanstack/react-query'
import { useMemo, type ReactNode } from 'react'
import { Shell } from './components/Shell'
import { SignIn } from './components/SignIn'
import { DEFAULT_SETTINGS, SettingsProvider, type AppSettings } from './lib/settings'
import { ProductRoutes } from './routes'
import type { Runtime } from './runtime'

export interface AppProps {
  runtime: Runtime
  settings?: AppSettings
  /** Tests pass a QueryClient that never retries. */
  queryClient?: QueryClient
}

/** Tells the product who is signed in, as the workspace does, so per-person browser data stays per person. */
function StandaloneSession({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const session = useMemo(
    () =>
      createSession({
        uid: user?.uid ?? 'standalone',
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        roles: [],
        permissions: [],
        plan: 'FREE',
        isDemo: false,
        can: () => true,
      }),
    [user?.uid, user?.email, user?.displayName],
  )
  return <WorkspaceSessionProvider value={session}>{children}</WorkspaceSessionProvider>
}

/**
 * The standalone app: providers, the sign-in gate and a frame around the same routes the workspace
 * mounts as a module. `data-product` gives everything inside the product's accent.
 */
export function App({ runtime, settings = DEFAULT_SETTINGS, queryClient }: AppProps) {
  return (
    <ThemeProvider>
      <AuthProvider client={runtime.authClient}>
        <ApiProvider client={runtime.apiClient} {...(queryClient ? { queryClient } : {})}>
          <ToastProvider>
            <SettingsProvider value={settings}>
              <div data-product="ask-your-life" className="ayl-root">
                <RequireAuth
                  loading={
                    <div className="ayl-signin">
                      <Spinner size={32} label="Checking your session" />
                    </div>
                  }
                  fallback={<SignIn mode={runtime.mode} />}
                >
                  <StandaloneSession>
                    <Shell>
                      <ProductRoutes />
                    </Shell>
                  </StandaloneSession>
                </RequireAuth>
              </div>
            </SettingsProvider>
          </ToastProvider>
        </ApiProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
