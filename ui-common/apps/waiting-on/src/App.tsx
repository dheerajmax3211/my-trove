import { ApiProvider } from '@platform/api-client'
import { AuthProvider, RequireAuth, useAuth } from '@platform/auth-web'
import { PortalContainerProvider, Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { SignIn } from './auth/SignIn'
import { ClockProvider } from './lib/clock'
import { AppLayout } from './layout/AppLayout'
import { WaitingOnRoutes } from './routes'
import { createRuntime, type Runtime } from './runtime'

/** Cached items belong to one user: drop them whenever the signed-in user changes or signs out. */
function ClearCacheOnUserChange() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const previous = useRef(user?.uid)
  useEffect(() => {
    if (previous.current !== user?.uid) queryClient.clear()
    previous.current = user?.uid
  }, [user?.uid, queryClient])
  return null
}

/**
 * The standalone app: providers, sign-in and its own layout around the same routes the workspace mounts.
 * Mount inside a Router. Pass a `runtime` to control auth, API and clock (tests do).
 */
export function App({ runtime: provided }: { runtime?: Runtime }) {
  const [runtime] = useState(() => provided ?? createRuntime())
  // The product accent applies below this element; dialogs and toasts portal into it so they keep it.
  const [root, setRoot] = useState<HTMLElement | null>(null)
  return (
    <div ref={setRoot} data-product="waiting-on" className="wo-root">
      <ThemeProvider>
        <PortalContainerProvider container={root}>
          <ClockProvider clock={runtime.clock}>
            <AuthProvider client={runtime.authClient}>
              <ApiProvider
                client={runtime.apiClient}
                {...(runtime.queryClient ? { queryClient: runtime.queryClient } : {})}
              >
                <ClearCacheOnUserChange />
                <ToastProvider>
                  <RequireAuth
                    loading={
                      <div className="wo-signin">
                        <Spinner size={32} label="Checking your session" />
                      </div>
                    }
                    fallback={<SignIn demo={runtime.demo} />}
                  >
                    <AppLayout demo={runtime.demo}>
                      <WaitingOnRoutes />
                    </AppLayout>
                  </RequireAuth>
                </ToastProvider>
              </ApiProvider>
            </AuthProvider>
          </ClockProvider>
        </PortalContainerProvider>
      </ThemeProvider>
    </div>
  )
}
