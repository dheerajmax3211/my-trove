import { ApiProvider } from '@platform/api-client'
import { AuthProvider, RequireAuth } from '@platform/auth-web'
import { Spinner, ThemeProvider, ToastProvider } from '@platform/ui'
import { SignIn } from './auth/SignIn'
import { Shell } from './layout/Shell'
import type { Runtime } from './runtime'

/** Providers and the signed-in shell. The caller supplies the router (browser in the app, memory in tests). */
export function App({ runtime }: { runtime: Runtime }) {
  return (
    <ThemeProvider>
      <AuthProvider client={runtime.authClient}>
        <ApiProvider client={runtime.apiClient} queryClient={runtime.queryClient}>
          <ToastProvider>
            <RequireAuth
              loading={
                <div className="signin">
                  <Spinner size={32} label="Checking your session" />
                </div>
              }
              fallback={<SignIn mode={runtime.authMode} />}
            >
              <Shell runtime={runtime} />
            </RequireAuth>
          </ToastProvider>
        </ApiProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
